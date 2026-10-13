import json
import os
import random

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
)
from sklearn.preprocessing import StandardScaler
from tensorflow import keras
from tensorflow.keras import layers


# ============================================================
# TransFraud: Tabular Transformer training pipeline
# Run from the backend directory:
#   python src/train_transformer.py
# ============================================================

SEED = 42
DATA_PATH = "datasets/SyntheticBanking/fraud_features.csv"
MODEL_DIR = "models"
MODEL_PATH = os.path.join(MODEL_DIR, "transfraud_transformer_final.keras")
PREPROCESSING_PATH = os.path.join(MODEL_DIR, "transfraud_preprocessing.joblib")
METRICS_PATH = os.path.join(MODEL_DIR, "transfraud_training_metrics.json")

BATCH_SIZE = 1024
EPOCHS = 20
EMBED_DIM = 32
LEARNING_RATE = 0.001

random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)
os.makedirs(MODEL_DIR, exist_ok=True)


# --------------------------- Load data ------------------------
print("\n[1/7] Loading feature dataset...", flush=True)
df = pd.read_csv(DATA_PATH, low_memory=False)

required_columns = [
    "timestamp", "is_fraud",
    "merchant_category", "merchant_country", "transaction_type",
    "amount_log1p", "hour", "day_of_week", "month",
    "customer_previous_count", "customer_avg_previous_amount",
    "customer_amount_deviation", "card_previous_count",
    "device_previous_count", "merchant_previous_count",
    "customer_device_previous_count", "new_device",
]
missing = sorted(set(required_columns) - set(df.columns))
if missing:
    raise ValueError(f"Missing required columns: {missing}")

df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
df["is_fraud"] = pd.to_numeric(df["is_fraud"], errors="coerce")
df = df.dropna(subset=["timestamp", "is_fraud"]).copy()
df["is_fraud"] = df["is_fraud"].astype(np.int32)
if not set(df["is_fraud"].unique()).issubset({0, 1}):
    raise ValueError("is_fraud must contain only 0 and 1.")

df = df.sort_values("timestamp", kind="stable").reset_index(drop=True)

categorical_columns = [
    "merchant_category",
    "merchant_country",
    "transaction_type",
]
numeric_columns = [
    "amount_log1p", "hour", "day_of_week", "month",
    "customer_previous_count", "customer_avg_previous_amount",
    "customer_amount_deviation", "card_previous_count",
    "device_previous_count", "merchant_previous_count",
    "customer_device_previous_count", "new_device",
]

for col in categorical_columns:
    df[col] = df[col].fillna("UNKNOWN").astype(str)
for col in numeric_columns:
    df[col] = pd.to_numeric(df[col], errors="coerce")
df[numeric_columns] = (
    df[numeric_columns]
    .replace([np.inf, -np.inf], np.nan)
    .fillna(0.0)
)

print(f"Rows: {len(df):,}")
print(f"Fraud transactions: {int(df['is_fraud'].sum()):,}")
print(f"Fraud percentage: {df['is_fraud'].mean() * 100:.4f}%")


# --------------------- Chronological split --------------------
print("\n[2/7] Creating chronological splits...", flush=True)
n_rows = len(df)
train_end = int(n_rows * 0.70)
val_end = int(n_rows * 0.85)
train_df = df.iloc[:train_end].copy()
val_df = df.iloc[train_end:val_end].copy()
test_df = df.iloc[val_end:].copy()

for split_name, split_df in (
    ("train", train_df), ("validation", val_df), ("test", test_df)
):
    if split_df.empty or split_df["is_fraud"].nunique() != 2:
        raise ValueError(
            f"{split_name} split must contain both fraud and legitimate "
            "examples. Check the chronological label distribution."
        )

print(f"Train: {len(train_df):,} rows; frauds={int(train_df['is_fraud'].sum()):,}")
print(f"Validation: {len(val_df):,} rows; frauds={int(val_df['is_fraud'].sum()):,}")
print(f"Test: {len(test_df):,} rows; frauds={int(test_df['is_fraud'].sum()):,}")


# --------------------- Fit preprocessing ----------------------
print("\n[3/7] Fitting preprocessing on training data only...", flush=True)
scaler = StandardScaler()
scaler.fit(train_df[numeric_columns].to_numpy(dtype=np.float32))

vocabularies = {
    col: train_df[col].unique().tolist()
    for col in categorical_columns
}
category_lookups = {
    col: {value: index + 2 for index, value in enumerate(vocabularies[col])}
    for col in categorical_columns
}


def make_inputs(frame):
    numeric = scaler.transform(
        frame[numeric_columns].to_numpy(dtype=np.float32)
    ).astype(np.float32)

    inputs = {"numeric": numeric}
    for col in categorical_columns:
        ids = frame[col].map(category_lookups[col]).fillna(0).to_numpy(
            dtype=np.int32
        )
        # Explicit (N, 1) shape matches each categorical Input(shape=(1,)).
        inputs[col] = ids.reshape(-1, 1)
    return inputs


X_train = make_inputs(train_df)
X_val = make_inputs(val_df)
X_test = make_inputs(test_df)

# Explicit (N, 1) label shape matches model output (batch, 1).
y_train = train_df["is_fraud"].to_numpy(dtype=np.float32).reshape(-1, 1)
y_val = val_df["is_fraud"].to_numpy(dtype=np.float32).reshape(-1, 1)
y_test = test_df["is_fraud"].to_numpy(dtype=np.int32).reshape(-1)

negative_count = int((y_train == 0).sum())
positive_count = int((y_train == 1).sum())
if positive_count == 0:
    raise ValueError("Training split contains no fraud examples.")
class_weight = {0: 1.0, 1: float(negative_count / positive_count)}
print("Class weights:", class_weight)


# --------------------- Build Transformer ----------------------
print("\n[4/7] Building tabular Transformer...", flush=True)

numeric_input = keras.Input(
    shape=(len(numeric_columns),), dtype=tf.float32, name="numeric"
)
model_inputs = {"numeric": numeric_input}

# Project the numerical vector into one distinct token per numeric feature.
# The projection learns separate weights for each output token and is serializable.
numeric_tokens = layers.Dense(
    len(numeric_columns) * EMBED_DIM,
    name="numeric_feature_projection",
)(numeric_input)
numeric_tokens = layers.Reshape(
    (len(numeric_columns), EMBED_DIM),
    name="numeric_feature_tokens",
)(numeric_tokens)

categorical_tokens = []
for col in categorical_columns:
    cat_input = keras.Input(shape=(1,), dtype=tf.int32, name=col)
    model_inputs[col] = cat_input

    embedding = layers.Embedding(
        input_dim=len(vocabularies[col]) + 2,
        output_dim=EMBED_DIM,
        name=f"{col}_embedding",
    )(cat_input)
    embedding = layers.Reshape(
        (1, EMBED_DIM), name=f"{col}_token"
    )(embedding)
    categorical_tokens.append(embedding)

tokens = layers.Concatenate(axis=1, name="feature_token_stack")(
    [numeric_tokens] + categorical_tokens
)

attention = layers.MultiHeadAttention(
    num_heads=4,
    key_dim=EMBED_DIM // 4,
    dropout=0.1,
    name="self_attention",
)(tokens, tokens)
x = layers.Add(name="attention_residual")([tokens, attention])
x = layers.LayerNormalization(epsilon=1e-6, name="attention_norm")(x)

ff = layers.Dense(
    EMBED_DIM * 2, activation="gelu", name="feed_forward_expand"
)(x)
ff = layers.Dropout(0.1, name="feed_forward_dropout")(ff)
ff = layers.Dense(EMBED_DIM, name="feed_forward_project")(ff)
x = layers.Add(name="feed_forward_residual")([x, ff])
x = layers.LayerNormalization(epsilon=1e-6, name="feed_forward_norm")(x)

x = layers.GlobalAveragePooling1D(name="pool_feature_tokens")(x)
x = layers.Dense(64, activation="gelu", name="classifier_dense")(x)
x = layers.Dropout(0.2, name="classifier_dropout")(x)
# Enforce exactly one output per transaction: (batch, 1).
prediction = layers.Dense(
    1, activation="sigmoid", name="fraud_probability"
)(x)

model = keras.Model(
    inputs=model_inputs, outputs=prediction, name="TransFraudTransformer"
)
model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE),
    loss=keras.losses.BinaryCrossentropy(),
    metrics=[
        keras.metrics.AUC(curve="PR", name="pr_auc"),
        keras.metrics.AUC(curve="ROC", name="roc_auc"),
        keras.metrics.Precision(name="precision"),
        keras.metrics.Recall(name="recall"),
    ],
)
model.summary()

# Fail fast if the output/label dimensions are not what training expects.
print("\nChecking tensor shapes...", flush=True)
print("Model output:", model.output_shape)
print("y_train:", y_train.shape)
assert model.output_shape == (None, 1), (
    f"Expected output shape (None, 1), got {model.output_shape}"
)
assert y_train.ndim == 2 and y_train.shape[1] == 1
small_batch = {key: value[:4] for key, value in X_train.items()}
small_prediction = model(small_batch, training=False)
assert tuple(small_prediction.shape) == (4, 1), (
    f"Expected four single-score predictions, got {small_prediction.shape}"
)
print("Shape checks passed.", flush=True)


# --------------------------- Train ----------------------------
print("\n[5/7] Training Transformer...", flush=True)
callbacks = [
    keras.callbacks.ModelCheckpoint(
        MODEL_PATH,
        monitor="val_pr_auc",
        mode="max",
        save_best_only=True,
        verbose=1,
    ),
    keras.callbacks.EarlyStopping(
        monitor="val_pr_auc",
        mode="max",
        patience=4,
        restore_best_weights=True,
        verbose=1,
    ),
    keras.callbacks.ReduceLROnPlateau(
        monitor="val_pr_auc",
        mode="max",
        factor=0.5,
        patience=2,
        min_lr=1e-6,
        verbose=1,
    ),
]

model.fit(
    X_train,
    y_train,
    validation_data=(X_val, y_val),
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    class_weight=class_weight,
    callbacks=callbacks,
    verbose=1,
)

# Checkpoint is created by this script and uses only standard Keras layers.
model = keras.models.load_model(MODEL_PATH)


# ---------------------- Validation threshold ------------------
print("\n[6/7] Selecting threshold using validation data...", flush=True)
val_probabilities = model.predict(
    X_val, batch_size=BATCH_SIZE, verbose=1
).reshape(-1)

precision, recall, thresholds = precision_recall_curve(
    y_val.reshape(-1), val_probabilities
)
if len(thresholds) > 0:
    f1 = (
        2 * precision[:-1] * recall[:-1]
        / (precision[:-1] + recall[:-1] + 1e-8)
    )
    decision_threshold = float(thresholds[int(np.argmax(f1))])
else:
    decision_threshold = 0.5
print("Validation-selected threshold:", decision_threshold)


# ----------------------- Final test evaluation ----------------
print("\n[7/7] Evaluating on untouched test data...", flush=True)
test_probabilities = model.predict(
    X_test, batch_size=BATCH_SIZE, verbose=1
).reshape(-1)
test_labels = y_test
test_predictions = (test_probabilities >= decision_threshold).astype(np.int32)

print("\nConfusion matrix [[TN, FP], [FN, TP]]:")
print(confusion_matrix(test_labels, test_predictions, labels=[0, 1]))
print("\nClassification report:")
print(
    classification_report(
        test_labels,
        test_predictions,
        labels=[0, 1],
        target_names=["Legitimate", "Fraud"],
        zero_division=0,
        digits=4,
    )
)

test_pr_auc = float(average_precision_score(test_labels, test_probabilities))
test_roc_auc = (
    float(roc_auc_score(test_labels, test_probabilities))
    if len(np.unique(test_labels)) == 2 else None
)
print("Test PR-AUC (average precision):", round(test_pr_auc, 6))
if test_roc_auc is not None:
    print("Test ROC-AUC:", round(test_roc_auc, 6))

preprocessing = {
    "numeric_columns": numeric_columns,
    "categorical_columns": categorical_columns,
    "vocabularies": vocabularies,
    "category_lookups": category_lookups,
    "scaler_mean": scaler.mean_.tolist(),
    "scaler_scale": scaler.scale_.tolist(),
    "decision_threshold": decision_threshold,
    "feature_schema_version": 3,
}
joblib.dump(preprocessing, PREPROCESSING_PATH)

metrics = {
    "rows": int(n_rows),
    "train_rows": int(len(train_df)),
    "validation_rows": int(len(val_df)),
    "test_rows": int(len(test_df)),
    "train_fraud_count": positive_count,
    "validation_fraud_count": int(y_val.sum()),
    "test_fraud_count": int(y_test.sum()),
    "decision_threshold": decision_threshold,
    "test_pr_auc": test_pr_auc,
    "test_roc_auc": test_roc_auc,
}
with open(METRICS_PATH, "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2)

print("\nTraining complete.")
print("Saved model:", MODEL_PATH)
print("Saved preprocessing:", PREPROCESSING_PATH)
print("Saved metrics:", METRICS_PATH)
