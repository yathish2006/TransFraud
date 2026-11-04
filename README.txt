TRANSFRAUD — REAL HISTORY + MODEL ANALYSIS UPDATE

What this update does
- Keeps the 7.5-second sequential frontend workflow visualization; the result waits for both the API response and the animation.
- The backend uses the existing model and history feature pipeline: dataset summary counts plus explicitly completed transactions that occurred before the assessment timestamp.
- Adds analysis_duration_ms to the /predict response and saved prediction record. This is measured backend processing time, not the 7.5-second visual animation.
- Frontend displays the measured backend analysis time next to the history note.
- Shows actual history feature values returned by the backend; it does not fabricate a fraud score from feature counts. The trained model produces fraud_probability.

IMPORTANT LIMITATION
The history index currently provides aggregate historical counts/average from history_summary.json plus explicitly completed transactions stored by the app. It does not retrieve and display every raw historical transaction row. The prediction itself is not counted as a completed transaction; use the app's transaction completion action only when a transaction actually completed.

INSTALL
1. Back up your existing frontend src/App.jsx, src/App.css, src/main.jsx and src/index.css.
2. Copy the files from frontend/src into your frontend project's src folder.
3. Back up the currently deployed backend main.py.
4. Copy backend/main.py into the backend project as main.py. Keep your existing models folder, virtual environment, requirements and deployment settings.
5. Run locally and test /health and POST /predict before deploying. The backend file requires the same packages and model/preprocessing/history files as your existing project.
6. Deploy the backend update, then deploy the frontend.

RISK POLICY NOTE
The frontend display bands are <30% Low, 30%–<90% Medium, and >=90% High. The existing backend decision threshold remains the model's configured threshold. Align those policies explicitly before using backend saved decisions as authoritative; this package does not silently change the model threshold.

The model inference can legitimately finish in under two seconds. The 7.5-second pipeline is a visual explanation of the request flow, not a claim that neural-network inference itself takes 7.5 seconds.

RISK SCORE UI UPDATE
- Replaces the verbose risk explanation and history-indicator chart with a focused Risk Score card inspired by the approved mockup.
- Shows a circular fraud-probability gauge, risk level, recommended action, and concise dynamically generated reasons based on fields actually returned by the API.
- Reasons include unfamiliar device/customer-device history, unusual amount versus the historical average, missing merchant history, and missing/limited customer history when those conditions apply.
- Removes the repeated risk-band legend and duplicate score explanation from the reasons section.
- These reasons are rule-based indicators from available fields; they are not feature-attribution explanations from the model.
