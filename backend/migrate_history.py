
import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
JSON_PATH = BASE_DIR / "models" / "history_summary.json"
DB_PATH = BASE_DIR / "models" / "history_summary.db"

print("Reading history summary...")

with JSON_PATH.open("r", encoding="utf-8") as file:
    history = json.load(file)

print("Creating SQLite database...")

if DB_PATH.exists():
    DB_PATH.unlink()

connection = sqlite3.connect(DB_PATH)

connection.execute("""
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
""")

connection.execute("""
CREATE TABLE history_records (
    category TEXT NOT NULL,
    record_key TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (category, record_key)
)
""")

connection.execute(
    "INSERT INTO metadata (key, value) VALUES (?, ?)",
    ("latest_dataset_timestamp", history["latest_dataset_timestamp"])
)

categories = [
    "customer",
    "card_counts",
    "device_counts",
    "merchant_counts",
    "customer_device_counts",
]

for category in categories:
    records = history.get(category, {})
    print(f"Importing {category}: {len(records)} records")

    connection.executemany(
        """
        INSERT INTO history_records (category, record_key, data)
        VALUES (?, ?, ?)
        """,
        [
            (category, str(key), json.dumps(value))
            for key, value in records.items()
        ],
    )

connection.commit()
connection.close()

print(f"Migration complete: {DB_PATH}")
