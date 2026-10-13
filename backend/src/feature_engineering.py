
from pathlib import Path
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]

INPUT_PATH = (
    BASE_DIR / "datasets" / "SyntheticBanking"
    / "Fraud Detection Dataset.csv"
)

OUTPUT_PATH = (
    BASE_DIR / "datasets" / "SyntheticBanking"
    / "fraud_features.csv"
)


def main():
    print("=" * 65)
    print("TRANSFRAUD — FEATURE ENGINEERING")
    print("=" * 65)

    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {INPUT_PATH}")

    print("\nLoading dataset...")
    df = pd.read_csv(INPUT_PATH, low_memory=False)

    required = {
        "timestamp", "customer_id", "card_id", "device_id",
        "merchant_id", "amount", "is_fraud",
    }
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    # Validate the fields used to construct the features.
    df["timestamp"] = pd.to_datetime(
        df["timestamp"], errors="coerce", utc=True
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["is_fraud"] = pd.to_numeric(
        df["is_fraud"], errors="coerce"
    )

    if df["timestamp"].isna().any():
        raise ValueError("Invalid timestamps found. Resolve them before training.")

    if df["amount"].isna().any() or (df["amount"] <= 0).any():
        raise ValueError("Invalid transaction amounts found.")

    if df["is_fraud"].isna().any():
        raise ValueError("Missing fraud labels found.")

    if not df["is_fraud"].isin([0, 1]).all():
        raise ValueError("is_fraud must contain only 0 and 1.")

    # A transaction must only use history from earlier transactions.
    print("Sorting transactions chronologically...")
    df.sort_values(
        ["timestamp", "transaction_id"],
        kind="mergesort",
        inplace=True,
        ignore_index=True,
    )

    print("Creating time features...")
    df["hour"] = df["timestamp"].dt.hour.astype("int8")
    df["day_of_week"] = df["timestamp"].dt.dayofweek.astype("int8")
    df["month"] = df["timestamp"].dt.month.astype("int8")
    df["amount_log1p"] = np.log1p(df["amount"]).astype("float32")

    print("Creating customer history features...")
    customer_group = df.groupby("customer_id", sort=False)

    df["customer_previous_count"] = (
        customer_group.cumcount().astype("int32")
    )

    # Exclude the current transaction from its historical average.
    customer_amount_cumsum = customer_group["amount"].cumsum()
    previous_amount_sum = customer_amount_cumsum - df["amount"]

    previous_count = df["customer_previous_count"]
    previous_average = (
        previous_amount_sum / previous_count.replace(0, np.nan)
    )

    df["customer_avg_previous_amount"] = (
        previous_average.fillna(0).astype("float32")
    )

    df["customer_amount_deviation"] = (
        (df["amount"] - df["customer_avg_previous_amount"]).abs()
        / df["customer_avg_previous_amount"].clip(lower=1.0)
    ).where(previous_count > 0, 0).astype("float32")

    print("Creating card, device, merchant and familiarity features...")
    df["card_previous_count"] = (
        df.groupby("card_id", sort=False)
        .cumcount()
        .astype("int32")
    )

    df["device_previous_count"] = (
        df.groupby("device_id", sort=False)
        .cumcount()
        .astype("int32")
    )

    df["merchant_previous_count"] = (
        df.groupby("merchant_id", sort=False)
        .cumcount()
        .astype("int32")
    )

    # A device is new for a customer if that pair has not appeared before.
    df["customer_device_previous_count"] = (
        df.groupby(["customer_id", "device_id"], sort=False)
        .cumcount()
        .astype("int32")
    )

    df["new_device"] = (
        df["customer_device_previous_count"] == 0
    ).astype("int8")

    # Retain the target and useful raw columns for later modeling.
    # fraud_type is deliberately excluded to prevent label leakage.
    output_columns = [
        "transaction_id",
        "timestamp",
        "customer_id",
        "card_id",
        "device_id",
        "merchant_id",
        "merchant_category",
        "merchant_country",
        "transaction_type",
        "amount",
        "amount_log1p",
        "hour",
        "day_of_week",
        "month",
        "customer_previous_count",
        "customer_avg_previous_amount",
        "customer_amount_deviation",
        "card_previous_count",
        "device_previous_count",
        "merchant_previous_count",
        "customer_device_previous_count",
        "new_device",
        "is_fraud",
    ]

    output_columns = [
        column for column in output_columns if column in df.columns
    ]
    result = df[output_columns]

    if result.isna().any().any():
        missing_counts = result.isna().sum()
        raise ValueError(
            "Missing values remain in output:\n"
            + missing_counts[missing_counts > 0].to_string()
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nSaving features to:\n{OUTPUT_PATH}")
    result.to_csv(OUTPUT_PATH, index=False)

    print("\nFEATURE ENGINEERING SUMMARY")
    print(f"Transactions: {len(result):,}")
    print(f"Features and metadata columns: {len(result.columns)}")
    print(f"Fraud transactions: {int(result['is_fraud'].sum()):,}")
    print(f"Fraud rate: {result['is_fraud'].mean() * 100:.4f}%")
    print(f"Time range: {result['timestamp'].min()} to {result['timestamp'].max()}")
    print("\nSample engineered features:")
    print(
        result[
            [
                "customer_id",
                "amount",
                "customer_previous_count",
                "customer_avg_previous_amount",
                "card_previous_count",
                "device_previous_count",
                "new_device",
                "is_fraud",
            ]
        ].head(10).to_string(index=False)
    )

    print("\nCompleted. Original CSV was not modified.")


if __name__ == "__main__":
    main()
