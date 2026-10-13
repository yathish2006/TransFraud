
from pathlib import Path
import pandas as pd

DATASET_PATH = (
    Path(__file__).resolve().parents[1]
    / "datasets"
    / "SyntheticBanking"
    / "Fraud Detection Dataset.csv"
)

def main():
    print("=" * 65)
    print("TRANSFRAUD — DATASET INSPECTION")
    print("=" * 65)

    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH}"
        )

    df = pd.read_csv(DATASET_PATH, low_memory=False)

    print(f"\nDataset file: {DATASET_PATH}")
    print(f"Rows: {len(df):,}")
    print(f"Columns: {len(df.columns)}")
    print(f"Memory usage: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")

    print("\n1. COLUMN NAMES AND DATA TYPES")
    print(df.dtypes.to_string())

    print("\n2. MISSING VALUES")
    missing = df.isna().sum()
    missing = missing[missing > 0].sort_values(ascending=False)

    if missing.empty:
        print("No missing values.")
    else:
        print(missing.to_string())
        print("\nMissing-value percentages:")
        print((missing / len(df) * 100).round(3).to_string())

    print("\n3. DUPLICATE CHECKS")
    print(f"Duplicate complete rows: {df.duplicated().sum():,}")

    if "transaction_id" in df.columns:
        print(
            "Duplicate transaction IDs:",
            f"{df['transaction_id'].duplicated().sum():,}"
        )

    print("\n4. FRAUD DISTRIBUTION")
    if "is_fraud" in df.columns:
        print(df["is_fraud"].value_counts(dropna=False).to_string())
        print("\nPercentages:")
        print(
            (df["is_fraud"].value_counts(normalize=True, dropna=False) * 100)
            .round(4)
            .to_string()
        )

        if df["is_fraud"].notna().all():
            fraud_rate = pd.to_numeric(
                df["is_fraud"], errors="coerce"
            ).mean() * 100
            print(f"\nNumeric fraud rate: {fraud_rate:.4f}%")

    print("\n5. TIMESTAMP RANGE")
    if "timestamp" in df.columns:
        timestamps = pd.to_datetime(
            df["timestamp"], errors="coerce", utc=True
        )
        print(f"Earliest: {timestamps.min()}")
        print(f"Latest:   {timestamps.max()}")
        print(f"Invalid timestamps: {timestamps.isna().sum():,}")

    print("\n6. NUMERIC SUMMARY")
    numeric_columns = [
        c for c in ["amount", "is_fraud", "merchant_latitude",
                    "merchant_longitude"]
        if c in df.columns
    ]
    print(df[numeric_columns].describe().to_string())

    print("\n7. CATEGORICAL SUMMARY")
    for column in [
        "transaction_type",
        "currency",
        "merchant_category",
        "merchant_country",
        "fraud_type",
    ]:
        if column in df.columns:
            print(f"\n{column}:")
            print(df[column].value_counts(dropna=False).head(10).to_string())

    print("\n8. SAMPLE FRAUD TRANSACTIONS")
    if "is_fraud" in df.columns:
        fraud_rows = df[df["is_fraud"].astype(str).str.strip() == "1"]
        if fraud_rows.empty:
            print("No rows labelled 1 found; inspect target encoding.")
        else:
            print(
                fraud_rows.head(5).to_string(index=False)
            )

    print("\nInspection complete. Original dataset was not modified.")

if __name__ == "__main__":
    main()
