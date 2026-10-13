
from pathlib import Path
import json

import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]

INPUT_PATH = (
    BASE_DIR / "datasets" / "SyntheticBanking"
    / "Fraud Detection Dataset.csv"
)

OUTPUT_PATH = BASE_DIR / "models" / "history_summary.json"


def main():
    print("=" * 60)
    print("TRANSFRAUD — BUILD COMPACT HISTORY INDEX")
    print("=" * 60)

    required = [
        "timestamp",
        "transaction_id",
        "customer_id",
        "card_id",
        "device_id",
        "merchant_id",
        "amount",
    ]

    print("\nLoading transaction data...")
    df = pd.read_csv(
        INPUT_PATH,
        usecols=required,
        low_memory=False,
    )

    df["timestamp"] = pd.to_datetime(
        df["timestamp"], utc=True, errors="raise"
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="raise")

    df.sort_values(
        ["timestamp", "transaction_id"],
        kind="mergesort",
        inplace=True,
        ignore_index=True,
    )

    print("Building customer summaries...")
    customer = (
        df.groupby("customer_id", sort=False)
        .agg(
            customer_previous_count=("amount", "size"),
            customer_avg_previous_amount=("amount", "mean"),
            latest_card_id=("card_id", "last"),
            latest_timestamp=("timestamp", "max"),
        )
    )

    print("Building card, device and merchant summaries...")
    card_counts = df.groupby("card_id", sort=False).size()
    device_counts = df.groupby("device_id", sort=False).size()
    merchant_counts = df.groupby("merchant_id", sort=False).size()

    pair_counts = (
        df.groupby(["customer_id", "device_id"], sort=False)
        .size()
    )

    latest_timestamp = df["timestamp"].max()

    summary = {
        "latest_dataset_timestamp": latest_timestamp.isoformat(),
        "customer": {
            str(key): {
                "previous_count": int(row["customer_previous_count"]),
                "avg_previous_amount": float(
                    row["customer_avg_previous_amount"]
                ),
                "latest_card_id": str(row["latest_card_id"]),
            }
            for key, row in customer.iterrows()
        },
        "card_counts": {
            str(key): int(value)
            for key, value in card_counts.items()
        },
        "device_counts": {
            str(key): int(value)
            for key, value in device_counts.items()
        },
        "merchant_counts": {
            str(key): int(value)
            for key, value in merchant_counts.items()
        },
        "customer_device_counts": {
            f"{customer_id}|{device_id}": int(value)
            for (customer_id, device_id), value in pair_counts.items()
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("\nSaving compact history index...")
    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(summary, file, separators=(",", ":"))

    print("\nHistory index created successfully.")
    print(f"Customers: {len(summary['customer']):,}")
    print(f"Cards: {len(summary['card_counts']):,}")
    print(f"Devices: {len(summary['device_counts']):,}")
    print(f"Merchants: {len(summary['merchant_counts']):,}")
    print(f"Latest dataset timestamp: {summary['latest_dataset_timestamp']}")
    print(f"Output: {OUTPUT_PATH}")
    print("Original dataset was not modified.")


if __name__ == "__main__":
    main()
