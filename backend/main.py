from pathlib import Path
from datetime import datetime, timezone
from threading import Lock
import json
import os

import joblib
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "transfraud_transformer_final.keras"
PREPROCESSING_PATH = BASE_DIR / "models" / "transfraud_preprocessing.joblib"
HISTORY_PATH = BASE_DIR / "models" / "history_summary.json"
PREDICTION_RECORDS_PATH = BASE_DIR / "models" / "prediction_records.json"
COMPLETED_TRANSACTIONS_PATH = BASE_DIR / "models" / "completed_transactions.json"

app = FastAPI(
    title="TransFraud API",
    description="Transformer-based transaction fraud risk assessment",
    version="4.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://trans-fraud.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


model = None
preprocessing = None
history = None
load_error = None
prediction_records = []
records_lock = Lock()
completed_transactions = []
completed_lock = Lock()


def load_prediction_records():
    global prediction_records
    PREDICTION_RECORDS_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not PREDICTION_RECORDS_PATH.exists():
        prediction_records = []
        return

    with PREDICTION_RECORDS_PATH.open("r", encoding="utf-8") as file:
        saved = json.load(file)

    if not isinstance(saved, list):
        raise ValueError("Prediction records file must contain a JSON list.")

    prediction_records = saved


def save_prediction_record(record: dict):
    with records_lock:
        updated_records = prediction_records + [record]
        temp_path = PREDICTION_RECORDS_PATH.with_suffix(".tmp")

        try:
            with temp_path.open("w", encoding="utf-8") as file:
                json.dump(updated_records, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())

            os.replace(temp_path, PREDICTION_RECORDS_PATH)
            prediction_records.append(record)
        except Exception:
            if temp_path.exists():
                temp_path.unlink()
            raise


def load_completed_transactions():
    global completed_transactions
    COMPLETED_TRANSACTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not COMPLETED_TRANSACTIONS_PATH.exists():
        completed_transactions = []
        return

    try:
        with COMPLETED_TRANSACTIONS_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, list):
            raise ValueError("Completed transactions file must contain a JSON list.")

        completed_transactions = data
        print(f"Loaded {len(completed_transactions)} completed transactions.")
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        raise RuntimeError(f"Could not load completed transactions: {exc}") from exc


def save_completed_transaction(record: dict):
    """Persist a completion record atomically and reject duplicate completions."""
    global completed_transactions

    with completed_lock:
        if any(
            item.get("record_id") == record.get("record_id")
            for item in completed_transactions
        ):
            raise ValueError("This transaction has already been completed.")

        updated_records = completed_transactions + [record]
        temp_path = COMPLETED_TRANSACTIONS_PATH.with_suffix(".tmp")

        try:
            COMPLETED_TRANSACTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
            with temp_path.open("w", encoding="utf-8") as file:
                json.dump(updated_records, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())

            os.replace(temp_path, COMPLETED_TRANSACTIONS_PATH)
            completed_transactions = updated_records
        except Exception:
            if temp_path.exists():
                temp_path.unlink()
            raise


def completed_ids():
    with completed_lock:
        return {item.get("record_id") for item in completed_transactions}


def parse_iso_datetime(value):
    """Parse an ISO timestamp into timezone-aware UTC."""
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def completed_before(ts):
    """Return completed transactions known by the requested prediction time."""
    with completed_lock:
        snapshot = list(completed_transactions)

    result = []
    for record in snapshot:
        completed_at = parse_iso_datetime(record.get("completed_at"))
        if completed_at is not None and completed_at <= ts:
            result.append(record)
    return result


@app.on_event("startup")
def load_artifacts():
    global model, preprocessing, history, load_error
    try:
        for path in (MODEL_PATH, PREPROCESSING_PATH, HISTORY_PATH):
            if not path.exists():
                raise FileNotFoundError(f"Required file not found: {path}")

        model = tf.keras.models.load_model(MODEL_PATH, compile=False)
        preprocessing = joblib.load(PREPROCESSING_PATH)

        with HISTORY_PATH.open("r", encoding="utf-8") as file:
            history = json.load(file)

        load_prediction_records()
        load_completed_transactions()
        load_error = None

        print("TransFraud model loaded successfully.")
        print("Transaction history index loaded successfully.")
        print("Saved prediction records loaded:", len(prediction_records))
        print("Completed transactions loaded:", len(completed_transactions))
        print("Latest historical transaction:", history["latest_dataset_timestamp"])
    except Exception as exc:
        model = None
        preprocessing = None
        history = None
        load_error = str(exc)
        print(f"TransFraud startup failed: {exc}")


class TransactionRequest(BaseModel):
    customer_id: str = Field(min_length=1)
    receiver_id: str = Field(min_length=1)
    amount: float = Field(gt=0, allow_inf_nan=False)
    device_id: str = "UNKNOWN_DEVICE"
    merchant_id: str = "UNKNOWN_MERCHANT"
    card_id: str | None = None
    merchant_category: str = "transfer"
    merchant_country: str = "IN"
    transaction_type: str = "transfer"
    timestamp: datetime | None = None

    # Legacy fields accepted for frontend compatibility; server history is authoritative.
    customer_previous_count: int | None = Field(default=None, ge=0)
    customer_avg_previous_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    card_previous_count: int | None = Field(default=None, ge=0)
    device_previous_count: int | None = Field(default=None, ge=0)
    merchant_previous_count: int | None = Field(default=None, ge=0)
    customer_device_previous_count: int | None = Field(default=None, ge=0)


def get_history_features(transaction: TransactionRequest, ts):
    latest = datetime.fromisoformat(
        history["latest_dataset_timestamp"].replace("Z", "+00:00")
    )
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=timezone.utc)
    latest = latest.astimezone(timezone.utc)

    if ts <= latest:
        raise ValueError(
            "The requested timestamp must be later than the latest transaction in "
            f"the historical dataset ({latest.isoformat()}). The summary index cannot "
            "answer historical as-of queries for earlier timestamps."
        )

    customer_record = history["customer"].get(transaction.customer_id, {})
    base_customer_count = int(customer_record.get("previous_count", 0))
    base_customer_average = float(customer_record.get("avg_previous_amount", 0.0))
    card_id = transaction.card_id or customer_record.get("latest_card_id")

    # Only explicitly completed transactions, completed no later than ts, update
    # dynamic history. A prediction alone never changes these feature counts.
    dynamic_records = completed_before(ts)
    customer_records = [
        record for record in dynamic_records
        if record.get("customer_id") == transaction.customer_id
    ]
    card_records = [
        record for record in dynamic_records
        if card_id and record.get("card_id") == card_id
    ]
    device_records = [
        record for record in dynamic_records
        if record.get("device_id") == transaction.device_id
    ]
    merchant_records = [
        record for record in dynamic_records
        if record.get("merchant_id") == transaction.merchant_id
    ]
    pair_records = [
        record for record in dynamic_records
        if record.get("customer_id") == transaction.customer_id
        and record.get("device_id") == transaction.device_id
    ]

    dynamic_customer_amounts = [
        float(record.get("amount", 0.0)) for record in customer_records
    ]
    customer_count = base_customer_count + len(customer_records)

    if customer_count > 0:
        total_customer_amount = (
            base_customer_average * base_customer_count
            + sum(dynamic_customer_amounts)
        )
        customer_average = total_customer_amount / customer_count
    else:
        customer_average = 0.0

    card_count = int(history["card_counts"].get(card_id, 0)) if card_id else 0
    device_count = int(history["device_counts"].get(transaction.device_id, 0))
    merchant_count = int(history["merchant_counts"].get(transaction.merchant_id, 0))
    pair_key = f"{transaction.customer_id}|{transaction.device_id}"
    customer_device_count = int(
        history["customer_device_counts"].get(pair_key, 0)
    )

    card_count += len(card_records)
    device_count += len(device_records)
    merchant_count += len(merchant_records)
    customer_device_count += len(pair_records)

    return {
        "customer_previous_count": customer_count,
        "customer_avg_previous_amount": customer_average,
        "card_previous_count": card_count,
        "device_previous_count": device_count,
        "merchant_previous_count": merchant_count,
        "customer_device_previous_count": customer_device_count,
        "new_device": int(customer_device_count == 0),
        "card_id_used_for_history": card_id,
        "history_source": "historical_dataset_summary_plus_completed_transactions",
    }


def encode_category(column: str, value: str) -> int:
    lookup = preprocessing["category_lookups"][column]
    normalized = value.strip().lower() if column != "merchant_country" else value.strip().upper()

    if normalized in lookup:
        return int(lookup[normalized])

    raise ValueError(
        f"Unseen category {value!r} for {column}. "
        f"Valid categories: {list(lookup.keys())}"
    )


def build_model_inputs(transaction: TransactionRequest, ts, features):
    amount = float(transaction.amount)
    avg_amount = float(features["customer_avg_previous_amount"])
    customer_count = int(features["customer_previous_count"])
    amount_deviation = (
        abs(amount - avg_amount) / max(avg_amount, 1.0)
        if customer_count > 0 else 0.0
    )

    numeric_values = {
        "amount_log1p": np.log1p(amount),
        "hour": ts.hour,
        "day_of_week": ts.weekday(),
        "month": ts.month,
        "customer_previous_count": customer_count,
        "customer_avg_previous_amount": avg_amount,
        "customer_amount_deviation": amount_deviation,
        "card_previous_count": features["card_previous_count"],
        "device_previous_count": features["device_previous_count"],
        "merchant_previous_count": features["merchant_previous_count"],
        "customer_device_previous_count": features["customer_device_previous_count"],
        "new_device": features["new_device"],
    }

    raw_numeric = np.array(
        [[numeric_values[column] for column in preprocessing["numeric_columns"]]],
        dtype=np.float32,
    )
    means = np.asarray(preprocessing["scaler_mean"], dtype=np.float32)
    scales = np.asarray(preprocessing["scaler_scale"], dtype=np.float32)

    if np.any(scales <= 0):
        raise ValueError("Invalid numeric scaling values in preprocessing.")

    scaled_numeric = (raw_numeric - means) / scales

    return {
        "merchant_category": np.array(
            [[encode_category("merchant_category", transaction.merchant_category)]],
            dtype=np.int32,
        ),
        "merchant_country": np.array(
            [[encode_category("merchant_country", transaction.merchant_country)]],
            dtype=np.int32,
        ),
        "transaction_type": np.array(
            [[encode_category("transaction_type", transaction.transaction_type)]],
            dtype=np.int32,
        ),
        "numeric": scaled_numeric.astype(np.float32),
    }


@app.get("/")
def home():
    return {
        "project": "TransFraud",
        "status": "API running",
        "model_status": "loaded" if model is not None else "unavailable",
        "history_loaded": history is not None,
        "saved_prediction_count": len(prediction_records),
        "completed_transaction_count": len(completed_transactions),
    }


@app.get("/health")
def health():
    return {
        "status": "healthy" if model is not None and history is not None else "degraded",
        "model_loaded": model is not None,
        "history_loaded": history is not None,
        "prediction_storage_loaded": PREDICTION_RECORDS_PATH.exists(),
        "saved_prediction_count": len(prediction_records),
        "completed_transaction_storage_loaded": COMPLETED_TRANSACTIONS_PATH.exists(),
        "completed_transaction_count": len(completed_transactions),
        "error": load_error,
    }


@app.post("/predict")
def predict(transaction: TransactionRequest):
    if model is None or preprocessing is None or history is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model or history index is unavailable: {load_error}",
        )

    try:
        ts = transaction.timestamp or datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        else:
            ts = ts.astimezone(timezone.utc)

        features = get_history_features(transaction, ts)
        model_inputs = build_model_inputs(transaction, ts, features)
        probability = float(model.predict(model_inputs, verbose=0)[0][0])

        if not np.isfinite(probability):
            raise ValueError("Model returned an invalid probability.")

        probability = float(np.clip(probability, 0.0, 1.0))
        threshold = float(preprocessing["decision_threshold"])
        high_risk = probability >= threshold

        history_features = {
            "customer_previous_count": features["customer_previous_count"],
            "customer_avg_previous_amount": round(
                features["customer_avg_previous_amount"], 4
            ),
            "card_previous_count": features["card_previous_count"],
            "device_previous_count": features["device_previous_count"],
            "merchant_previous_count": features["merchant_previous_count"],
            "customer_device_previous_count": features["customer_device_previous_count"],
            "new_device": features["new_device"],
        }

        record = {
            "record_id": f"TF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
            "timestamp": ts.isoformat(),
            "customer_id": transaction.customer_id,
            "receiver_id": transaction.receiver_id,
            "amount": float(transaction.amount),
            "device_id": transaction.device_id,
            "merchant_id": transaction.merchant_id,
            "card_id": features["card_id_used_for_history"],
            "merchant_category": transaction.merchant_category,
            "merchant_country": transaction.merchant_country,
            "transaction_type": transaction.transaction_type,
            "fraud_probability": round(probability, 6),
            "decision_threshold": round(threshold, 6),
            "risk": "High" if high_risk else "Low",
            "decision": "Alert / Verify" if high_risk else "Proceed",
            "model_status": "loaded",
            "history_source": features["history_source"],
            "history_features": history_features,
        }

        try:
            save_prediction_record(record)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Prediction was calculated but could not be saved: {exc}",
            ) from exc

        return {
            **record,
            "saved": True,
            "completed": False,
            "history_note": (
                "Feature counts combine the original dataset summary with transactions "
                "explicitly marked completed before the prediction timestamp. A prediction "
                "by itself does not update history. The original dataset is not modified."
            ),
        }

    except HTTPException:
        raise
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@app.post("/transactions/{record_id}/complete")
def complete_transaction(record_id: str):
    if model is None or history is None:
        raise HTTPException(
            status_code=503,
            detail="Model or transaction history is not loaded.",
        )

    with records_lock:
        prediction_record = next(
            (record.copy() for record in prediction_records
             if record.get("record_id") == record_id),
            None,
        )

    if prediction_record is None:
        raise HTTPException(status_code=404, detail="Prediction record not found.")

    completed_record = {
        **prediction_record,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
    }

    try:
        save_completed_transaction(completed_record)
    except ValueError:
        raise HTTPException(
            status_code=409,
            detail="This transaction has already been completed.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save completed transaction: {exc}",
        ) from exc

    return {
        "success": True,
        "message": "Transaction marked completed. Future predictions can use it as history.",
        "record_id": record_id,
        "completed_at": completed_record["completed_at"],
    }


@app.get("/transactions/completed")
def list_completed_transactions():
    with completed_lock:
        records = list(completed_transactions)
    return {"count": len(records), "transactions": records}


@app.get("/dashboard/summary")
def dashboard_summary():
    with records_lock:
        records = list(prediction_records)

    total = len(records)
    high_risk = sum(1 for record in records if record.get("risk") == "High")
    ids = completed_ids()

    return {
        "source": "saved_api_predictions",
        "total_predictions": total,
        "high_risk_predictions": high_risk,
        "low_risk_predictions": total - high_risk,
        "completed_transactions": len(ids),
        "review_rate_percent": round(high_risk / total * 100, 2) if total else 0.0,
        "latest_prediction_at": records[-1].get("timestamp") if records else None,
    }


@app.get("/dashboard/transactions")
def dashboard_transactions(limit: int = Query(default=100, ge=1, le=1000)):
    with records_lock:
        records = [record.copy() for record in prediction_records]
    ids = completed_ids()

    records.reverse()
    for record in records:
        record["completed"] = record.get("record_id") in ids

    return {
        "source": "saved_api_predictions",
        "count": min(len(records), limit),
        "transactions": records[:limit],
    }


@app.get("/dashboard/alerts")
def dashboard_alerts(limit: int = Query(default=100, ge=1, le=1000)):
    with records_lock:
        records = [record.copy() for record in prediction_records]

    alerts = [record for record in reversed(records) if record.get("risk") == "High"]
    ids = completed_ids()
    for record in alerts:
        record["completed"] = record.get("record_id") in ids

    return {
        "source": "saved_api_predictions",
        "count": min(len(alerts), limit),
        "alerts": alerts[:limit],
    }
