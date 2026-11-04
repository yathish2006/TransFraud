
import { Fragment, useEffect, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  ArrowLeftRight,
  ArrowRight,
  ShieldAlert,
  Search,
  Bell,
  Download,
  SlidersHorizontal,
  Activity,
  Menu,
  X,
  CircleAlert,
  CheckCircle2,
  Clock3,
  Database,
  BrainCircuit,
  Gauge,
  Workflow,
  CircleCheck,
  LoaderCircle,
  AlertTriangle,
  BarChart3, Users, Store, FileText, Settings, MapPin, Wallet, Shield,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import "./App.css";
function buildTrendData(records) {
  const buckets = new Map();

  for (const record of records || []) {
    if (!record.timestamp) continue;

    const date = new Date(record.timestamp);
    if (Number.isNaN(date.getTime())) continue;

    const hourKey = new Date(date);
    hourKey.setMinutes(0, 0, 0);
    const key = hourKey.toISOString();

    if (!buckets.has(key)) {
      buckets.set(key, {
        time: hourKey.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        total: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
      });
    }

    const bucket = buckets.get(key);
    const risk = String(record.risk || "").toLowerCase();
    bucket.total += 1;

    if (risk === "high") bucket.highRisk += 1;
    else if (risk === "medium") bucket.mediumRisk += 1;
    else if (risk === "low") bucket.lowRisk += 1;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .slice(-12)
    .map(([, bucket]) => bucket);
}
const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Fraud Detection", icon: ShieldAlert },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Analytics", icon: BarChart3 },
  { label: "Alerts", icon: Bell },
  { label: "Customers", icon: Users },
  { label: "Merchants", icon: Store },
  { label: "Model Insights", icon: BrainCircuit },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings },
];

// UI risk bands requested for the demo. These bands are separate from the
// model's training/serving threshold and should be described as display bands.
function getDisplayRisk(score) {
  const percent = Number(score || 0) * 100;
  if (percent < 30) return { level: "Low", decision: "Proceed", tone: "low" };
  if (percent < 90) return { level: "Medium", decision: "Review / Verify", tone: "medium" };
  return { level: "High", decision: "Alert / Verify", tone: "high" };
}
function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function downloadCsv(filename, rows, columns) {
  const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.join(","), ...(rows || []).map((row) => columns.map((key) => escapeCell(row[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [predictionForm, setPredictionForm] = useState({
    customer_id: "",
    receiver_id: "",
    amount: "",
    device_id: "",
    payment_purpose: "personal",
    merchant_category: "transfer",
    merchant_country: "IN",
    transaction_type: "transfer",
  });
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [predictionError, setPredictionError] = useState("");
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dashboardTransactions, setDashboardTransactions] = useState([]);
  const [dashboardDataError, setDashboardDataError] = useState("");
  const [completionBusyId, setCompletionBusyId] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [completionError, setCompletionError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const [summaryResponse, alertsResponse, transactionsResponse] = await Promise.all([
          fetch("https://transfraud.onrender.com/dashboard/summary"),
          fetch("https://transfraud.onrender.com/dashboard/alerts?limit=100"),
          fetch("https://transfraud.onrender.com/dashboard/transactions?limit=100"),
        ]);

        if (!summaryResponse.ok || !alertsResponse.ok || !transactionsResponse.ok) {
          throw new Error("Could not load dashboard data from the API.");
        }

        const summaryData = await summaryResponse.json();
        const alertsData = await alertsResponse.json();
        const transactionsData = await transactionsResponse.json();

        if (cancelled) return;

        setDashboardSummary(summaryData);
        setDashboardTransactions(transactionsData.transactions || []);
        setAlerts(
          (alertsData.alerts || []).map((record) => ({
            id: record.record_id,
            message: `${record.decision} — ${record.customer_id}`,
            segment: record.transaction_type || "Transaction",
            time: record.timestamp
              ? new Date(record.timestamp).toLocaleString()
              : "Unknown time",
            status: "Investigating",
            severity: record.risk || "High",
          }))
        );
        setDashboardDataError("");
      } catch (error) {
        if (!cancelled) {
          setDashboardDataError(error.message || "Dashboard API unavailable.");
        }
      }
    }

    loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, []);
  const trendData = buildTrendData(dashboardTransactions);
  const filteredAlerts = alerts.filter((alert) =>
    `${alert.id} ${alert.message} ${alert.segment} ${alert.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  function createAlert() {
    const id = `TXN-${String(Date.now()).slice(-5)}`;
    setAlerts((previous) => [
      {
        id,
        message: "Manual review requested",
        segment: "Digital Payments",
        time: "Just now",
        status: "Monitoring",
        severity: "Medium",
      },
      ...previous,
    ]);
    setActivePage("Alerts");
  }
  async function submitPrediction(event) {
    event.preventDefault();
    setPredictionLoading(true);
    setPredictionError("");
    setPrediction(null);
    setPipelineStep(0);

    // A deliberate 7.5-second UI sequence. The API request runs in parallel,
    // but the result is not shown until BOTH the API and visual sequence finish.
    // These are visual presentation timings, not measured model-stage durations.
    const animatePipeline = async () => {
      const stageDurations = [1100, 1200, 1300, 1300, 1400, 1200];
      for (let index = 0; index < stageDurations.length; index += 1) {
        await wait(stageDurations[index]);
        setPipelineStep(index === stageDurations.length - 1 ? 5 : index + 1);
      }
    };

    const payload = {
      customer_id: predictionForm.customer_id.trim(),
      receiver_id: predictionForm.receiver_id.trim(),
      amount: Number(predictionForm.amount),
      device_id: predictionForm.device_id.trim() || "UNKNOWN_DEVICE",
      // Merchant ID is intentionally not requested in the UI. History for an
      // unknown merchant cannot be treated as available history.
      merchant_id: "UNKNOWN_MERCHANT",
      merchant_category: predictionForm.merchant_category,
      merchant_country: predictionForm.merchant_country,
      transaction_type: predictionForm.transaction_type,
    };

    try {
      const requestPromise = (async () => {
        const response = await fetch("https://transfraud.onrender.com/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || `Prediction failed (HTTP ${response.status})`);
        }
        return data;
      })();

      // Promise.all prevents the score/result from appearing before the 7.5s
      // animation ends when the backend returns quickly.
      const [data] = await Promise.all([requestPromise, animatePipeline()]);
      setPipelineStep(5);
      setPrediction(data);

      // Refresh dashboard data after the prediction has been displayed.
      try {
        const [summaryResponse, alertsResponse, transactionsResponse] = await Promise.all([
          fetch("https://transfraud.onrender.com/dashboard/summary"),
          fetch("https://transfraud.onrender.com/dashboard/alerts?limit=100"),
          fetch("https://transfraud.onrender.com/dashboard/transactions?limit=100"),
        ]);
        if (!summaryResponse.ok || !alertsResponse.ok || !transactionsResponse.ok) {
          throw new Error("Prediction succeeded, but dashboard data could not be refreshed.");
        }
        const summaryData = await summaryResponse.json();
        const alertsData = await alertsResponse.json();
        const transactionsData = await transactionsResponse.json();
        setDashboardSummary(summaryData);
        setDashboardTransactions(transactionsData.transactions || []);
        setAlerts((alertsData.alerts || []).map((record) => ({
          id: record.record_id,
          message: `${record.decision} — ${record.customer_id}`,
          segment: record.transaction_type || "Transaction",
          time: record.timestamp ? new Date(record.timestamp).toLocaleString() : "Unknown time",
          status: "Investigating",
          severity: record.risk || "High",
        })));
        setDashboardDataError("");
      } catch (refreshError) {
        setDashboardDataError(refreshError.message || "Prediction saved, but dashboard data did not refresh.");
      }
      setActivePage("Fraud Detection");
    } catch (error) {
      setPipelineStep(-1);
      setPredictionError(error.message || "Could not reach the TransFraud API. Check that FastAPI is running.");
    } finally {
      setPredictionLoading(false);
    }
  }
  async function markTransactionCompleted(record) {
    if (!record?.record_id || record.completed) return;

    const confirmed = window.confirm(
      `Confirm that transaction ${record.record_id} actually completed? Only confirmed transactions will update future history features.`
    );
    if (!confirmed) return;

    setCompletionBusyId(record.record_id);
    setCompletionMessage("");
    setCompletionError("");

    try {
      const response = await fetch(
        `https://transfraud.onrender.com/transactions/${encodeURIComponent(record.record_id)}/complete`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `Completion failed (HTTP ${response.status})`);
      }

      const [summaryResponse, alertsResponse, transactionsResponse] = await Promise.all([
        fetch("https://transfraud.onrender.com/dashboard/summary"),
        fetch("https://transfraud.onrender.com/dashboard/alerts?limit=100"),
        fetch("https://transfraud.onrender.com/dashboard/transactions?limit=100"),
      ]);
      if (!summaryResponse.ok || !alertsResponse.ok || !transactionsResponse.ok) {
        throw new Error("Transaction was completed, but dashboard refresh failed. Refresh the page.");
      }

      const [summaryData, alertsData, transactionsData] = await Promise.all([
        summaryResponse.json(),
        alertsResponse.json(),
        transactionsResponse.json(),
      ]);
      setDashboardSummary(summaryData);
      setDashboardTransactions(transactionsData.transactions || []);
      setAlerts((alertsData.alerts || []).map((item) => ({
        id: item.record_id,
        message: `${item.decision} — ${item.customer_id}`,
        segment: item.transaction_type || "Transaction",
        time: item.timestamp ? new Date(item.timestamp).toLocaleString() : "Unknown time",
        status: item.completed ? "Completed" : "Investigating",
        severity: item.risk || "High",
      })));
      setDashboardDataError("");
      setCompletionMessage(
        `Transaction ${record.record_id} marked completed. Future predictions made after completion can use it in history.`
      );
    } catch (error) {
      setCompletionError(error.message || "Could not complete this transaction.");
    } finally {
      setCompletionBusyId("");
    }
  }

  function updatePredictionField(event) {
    const { name, value } = event.target;
    setPredictionForm((current) => ({ ...current, [name]: value }));
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setActivePage("Overview")}
          aria-label="TransFraud home"
        >
          <span className="brand-mark"><ShieldCheck size={28} /></span>
          <span>Trans<span className="brand-accent">Fraud</span></span>
        </button>
        <div className="top-controls">
          <label className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search transactions, alerts..."
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
          <button className="primary-button" onClick={createAlert}>
            <span>+</span> Create Alert
          </button>
          <button className="icon-button" aria-label="Export" onClick={() => window.print()}>
            <Download size={19} />
          </button>
          <button className="icon-button" aria-label="Notifications" onClick={() => setActivePage("Alerts")} title="Open alerts">
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <button
            className="icon-button mobile-menu"
            onClick={() => setShowSidebar(!showSidebar)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      <div className="workspace">
        {showSidebar && (
          <aside className="sidebar">
            <div className="sidebar-heading">
              <span>WORKSPACE</span>
              <button onClick={() => setShowSidebar(false)} aria-label="Hide sidebar">
                <X size={15} />
              </button>
            </div>
            <div className="nav-list">
              {navigation.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className={`nav-item ${activePage === label ? "active" : ""}`}
                  onClick={() => setActivePage(label)}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="sidebar-footer">
              <span className="status-indicator" />
              <div>
                <strong>TransFraud</strong>
                <small>Fraud intelligence</small>
              </div>
            </div>
          </aside>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">FRAUD INTELLIGENCE / {activePage.toUpperCase()}</div>
              <h1>{activePage === "Overview" ? "Risk Overview" : activePage}</h1>
              <p>
                {{
                  "Overview": "Real-time transaction fraud detection and risk analysis.",
                  "Fraud Detection": "Assess a transaction using the deployed TransFraud model.",
                  "Transactions": "Review saved predictions and confirmed transaction outcomes.",
                  "Analytics": "Explore risk patterns from prediction records returned by the API.",
                  "Alerts": "Review high-risk predictions and transactions requiring attention.",
                  "Customers": "Summarize customer activity from saved prediction records.",
                  "Merchants": "Review merchant-related fields available in saved prediction records.",
                  "Model Insights": "Review model architecture, reported metrics and explanation limits.",
                  "Reports": "Export the currently available transaction and alert records.",
                  "Settings": "Review the current API connection and dashboard configuration."
                }[activePage] || "Monitor transaction risk and identify suspicious activity."}
              </p>
            </div>
            <button
              className={`filter-button ${showFilters ? "selected" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={17} /> Filters
            </button>
          </div>
          {showFilters && (
            <div className="filter-panel">
              <span>Severity:</span>
              <button onClick={() => setSearch("High")}>High</button>
              <button onClick={() => setSearch("Medium")}>Medium</button>
              <button onClick={() => setSearch("Resolved")}>Resolved</button>
              <button onClick={() => setSearch("")}>Clear filters</button>
            </div>
          )}
          {(activePage === "Overview" || activePage === "Fraud Detection") && <section className="panel" style={{ marginBottom: 22, padding: 22 }}>
            <PanelHeading
              title="Live Transaction Risk Check"
              action={prediction ? "Run another check" : "Model API connected"}
              onAction={() => {
                document.getElementById("transfraud-prediction-form")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
            />
            <p style={{ color: "#858c9a", marginTop: 0, fontSize: 13 }}>
              Submit a transaction to request a score from the trained Transformer API.
              Sender and receiver details are assessed with available customer, card, device and merchant history from the backend.
            </p>
            <form
              id="transfraud-prediction-form"
              onSubmit={submitPrediction}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 14,
              }}
            >
              {[
                ["customer_id", "Sender ID", "text", true],
                ["receiver_id", "Receiver ID", "text", true],
                ["amount", "Amount (₹)", "number", true],
                ["device_id", "Device ID", "text", false],
              ].map(([name, label, type, required]) => (
                <label key={name} style={{ display: "grid", gap: 6, fontSize: 12, color: "#626b79" }}>
                  <span>{label}{required && <span className="required-mark"> *</span>}{!required && <span className="optional-label"> (optional)</span>}</span>
                  <input
                    name={name}
                    type={type}
                    min={type === "number" ? "0" : undefined}
                    step={name === "amount" || name === "customer_avg_previous_amount" ? "0.01" : "1"}
                    required={required}
                    value={predictionForm[name]}
                    onChange={updatePredictionField}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 11px",
                      border: "1px solid #dfe4eb",
                      borderRadius: 8,
                      background: "#fff",
                      color: "#27313f",
                    }}
                  />
                </label>
              ))}
              {[
                {
                  name: "payment_purpose",
                  label: "Payment purpose",
                  options: ["personal", "business"],
                },
                {
                  name: "merchant_category",
                  label: "Merchant category",
                  options: ["travel", "restaurants", "gas_station", "electronics", "pharmacy", "utilities", "entertainment", "fashion", "grocery", "online_marketplace", "transfer"],
                },
                {
                  name: "merchant_country",
                  label: "Merchant country",
                  options: ["IN", "US", "GB", "DE", "CA", "FR", "ES", "IT", "AU", "BR"],
                },
                {
                  name: "transaction_type",
                  label: "Transaction type",
                  options: ["transfer", "purchase"],
                },
              ].map(({ name, label, options }) => (
                <label key={name} style={{ display: "grid", gap: 6, fontSize: 12, color: "#626b79" }}>
                  <span>{label}<span className="required-mark"> *</span></span>
                  <select
                    name={name}
                    required
                    value={predictionForm[name]}
                    onChange={updatePredictionField}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 11px",
                      border: "1px solid #dfe4eb",
                      borderRadius: 8,
                      background: "#fff",
                      color: "#27313f",
                    }}
                  >
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ))}
              <div style={{ display: "flex", alignItems: "end" }}>
                <button className="primary-button" type="submit" disabled={predictionLoading}>
                  {predictionLoading ? "Assessing..." : "Assess transaction"}
                </button>
              </div>
            </form>
            <section className="pipeline-panel" aria-live="polite">
              <div className="pipeline-heading">
                <div>
                  <div className="pipeline-eyebrow"><Workflow size={15} /> MODEL WORKFLOW</div>
                  <h3>Transaction risk analysis pipeline</h3>
                  <p>Follow the request from transaction details to the returned decision.</p>
                </div>
                {predictionLoading && <span className="pipeline-live"><LoaderCircle size={14} className="spin" /> Processing</span>}
                {!predictionLoading && prediction && <span className="pipeline-done"><CircleCheck size={14} /> Assessment complete</span>}
              </div>
              <div className="pipeline-steps">
                {[
                  { title: "Transaction input", detail: "Validate the customer, receiver, amount and transaction type.", icon: CheckCircle2 },
                  { title: "History lookup", detail: "Retrieve available customer, card, device and merchant history.", icon: Database },
                  { title: "Feature extraction", detail: "Prepare prior counts, device familiarity and amount-pattern features.", icon: Activity },
                  { title: "Preprocessing & encoding", detail: "Scale numeric values and encode categories in the model's expected format.", icon: SlidersHorizontal },
                  { title: "Transformer prediction", detail: "Pass prepared features to the trained model to obtain a score.", icon: BrainCircuit },
                  { title: "Risk decision", detail: "Apply the displayed risk bands and show relevant history indicators.", icon: Gauge },
                ].map((stage, index) => {
                  const StageIcon = stage.icon;
                  const complete = Boolean(prediction) || (predictionLoading && pipelineStep > index);
                  const active = predictionLoading && pipelineStep === index;
                  return <Fragment key={stage.title}>
                    <div className={`pipeline-step ${complete ? "complete" : ""} ${active ? "active" : ""}`}>
                      <div className="pipeline-step-icon">{complete ? <CheckCircle2 size={18} /> : active ? <LoaderCircle size={18} className="spin" /> : <StageIcon size={18} />}</div>
                      <div className="pipeline-step-copy"><strong>{stage.title}</strong><span>{stage.detail}</span>
                        <em>{complete ? "Completed" : active ? "In progress" : "Waiting"}</em>
                      </div>
                    </div>
                    {index < 5 && <div className={`pipeline-connector ${complete ? "complete" : active ? "active" : ""}`} aria-hidden="true"><ArrowRight size={20} strokeWidth={2.5} /></div>}
                  </Fragment>;
                })}
              </div>
              <p className="pipeline-note">The API checks the available transaction-history index, derives features and runs the trained model. The timeline visualizes these steps sequentially; the returned analysis duration measures actual backend processing time.</p>
            </section>
            {predictionError && (
              <div role="alert" style={{ marginTop: 16, padding: 12, borderRadius: 8, color: "#a12828", background: "#fff0ef" }}>
                <strong>Prediction error:</strong> {predictionError}
              </div>
            )}
            {prediction && (() => {
              const displayRisk = getDisplayRisk(prediction.fraud_probability);
              const palette = displayRisk.tone === "high" ? { border: "#f2b9b1", bg: "#fff5f3", text: "#c34232" } : displayRisk.tone === "medium" ? { border: "#f3d18c", bg: "#fff9e9", text: "#a96b00" } : { border: "#a7dfcb", bg: "#f1fbf7", text: "#168363" };
              return <RiskScorePanel prediction={{ ...prediction, display_risk: displayRisk.level }} amount={Number(predictionForm.amount)} displayRisk={displayRisk} />;
            })()}
            {prediction && <RiskEvidencePanel prediction={prediction} transactions={dashboardTransactions} />}
          </section>}
          {activePage === "Transactions" && (
            <section className="panel" style={{ marginBottom: 22, padding: 22 }}>
              <PanelHeading
                title="Saved Transaction Predictions"
                action={`${dashboardTransactions.length} records`}
                onAction={() => window.open("https://transfraud.onrender.com/dashboard/transactions", "_blank", "noopener,noreferrer")}
              />
              {completionMessage && (
                <p role="status" style={{ color: "#087f5b", background: "#eaf8f1", padding: 10, borderRadius: 8, fontSize: 13 }}>
                  {completionMessage}
                </p>
              )}
              {completionError && (
                <p role="alert" style={{ color: "#a12828", background: "#fff0ef", padding: 10, borderRadius: 8, fontSize: 13 }}>
                  {completionError}
                </p>
              )}
              {dashboardTransactions.length === 0 ? (
                <p style={{ color: "#737d8b", fontSize: 13 }}>
                  No saved predictions yet. Assess a transaction using the live risk check above to create a record.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                    <thead>
                      <tr>
                        {["Timestamp", "Customer", "Receiver", "Amount", "Fraud score", "Risk", "Decision", "Completion"].map((heading) => (
                          <th key={heading} style={{ padding: "12px 10px", borderBottom: "1px solid #e3e8ef", color: "#737d8b", whiteSpace: "nowrap" }}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardTransactions
                        .filter((record) => `${record.customer_id} ${record.receiver_id} ${record.record_id} ${record.risk} ${record.decision}`.toLowerCase().includes(search.toLowerCase()))
                        .map((record) => (
                          <tr key={record.record_id}>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4", whiteSpace: "nowrap" }}>
                              {record.timestamp ? new Date(record.timestamp).toLocaleString() : "—"}
                            </td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4" }}>{record.customer_id}</td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4" }}>{record.receiver_id}</td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4", whiteSpace: "nowrap" }}>₹{Number(record.amount).toLocaleString()}</td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4", whiteSpace: "nowrap" }}>{(Number(record.fraud_probability) * 100).toFixed(2)}%</td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4" }}>
                              <span style={{ color: record.risk === "High" ? "#c9362b" : "#07866e", fontWeight: 600 }}>{record.risk}</span>
                            </td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4", whiteSpace: "nowrap" }}>{record.decision}</td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f4", whiteSpace: "nowrap" }}>
                              {record.completed ? (
                                <span style={{ color: "#087f5b", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <CheckCircle2 size={15} /> Completed
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={completionBusyId === record.record_id}
                                  onClick={() => markTransactionCompleted(record)}
                                  style={{ padding: "7px 10px", fontSize: 12, opacity: completionBusyId === record.record_id ? 0.65 : 1 }}
                                >
                                  {completionBusyId === record.record_id ? "Saving..." : "Mark completed"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {activePage === "Overview" && (
            <>
              <section className="stats-grid">
                <StatCard
                  icon={<Activity />}
                  label="Predictions Saved"
                  value={(dashboardSummary?.total_predictions ?? 0).toLocaleString()}
                  change={dashboardSummary ? "Real API records" : "Loading API data"}
                  tone="orange"
                />
                <StatCard
                  icon={<ShieldAlert />}
                  label="High-Risk Predictions"
                  value={(dashboardSummary?.high_risk_predictions ?? 0).toLocaleString()}
                  change="Alert / Verify"
                  tone="red"
                />
                <StatCard
                  icon={<CheckCircle2 />}
                  label="Low-Risk Predictions"
                  value={(dashboardSummary?.low_risk_predictions ?? 0).toLocaleString()}
                  change="Proceed"
                  tone="green"
                />
                <StatCard
                  icon={<Clock3 />}
                  label="Review Rate"
                  value={`${dashboardSummary?.review_rate_percent ?? 0}%`}
                  change="High-risk share of saved predictions"
                  tone="blue"
                />
              </section>
              {dashboardDataError && (
                <p role="alert" style={{ color: "#b42318", fontSize: 12 }}>
                  Dashboard data could not be refreshed: {dashboardDataError}
                </p>
              )}
            </>
          )}
          {activePage === "Overview" && (
            <section className="reference-analytics-grid">
              <article className="panel reference-panel">
                <PanelHeading title="Prediction activity" action="View analytics" onAction={() => setActivePage("Analytics")} />
                <div className="reference-chart">
                  {trendData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid stroke="#edf0f4" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="total" name="Predictions" stroke="#1477e8" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="highRisk" name="High risk" stroke="#d94343" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <div className="empty-state">No saved prediction history is available to plot yet.</div>}
                </div>
              </article>
              <article className="panel reference-panel">
                <PanelHeading title="Risk distribution" action="View transactions" onAction={() => setActivePage("Transactions")} />
                <div className="distribution-list">{[{ label: "High risk", count: dashboardTransactions.filter(r => r.risk === "High").length, tone: "high" }, { label: "Medium risk", count: dashboardTransactions.filter(r => r.risk === "Medium").length, tone: "medium" }, { label: "Low risk", count: dashboardTransactions.filter(r => r.risk === "Low").length, tone: "low" }].map(item => { const total = dashboardTransactions.length || 1; return <div className="distribution-row" key={item.label}><div><span className={`distribution-dot ${item.tone}`} />{item.label}<strong>{item.count}</strong></div><div className="distribution-track"><span className={item.tone} style={{ width: `${Math.min(100, item.count / total * 100)}%` }} /></div></div> })}<p className="section-subtitle">Calculated from {dashboardTransactions.length} records currently loaded from the API.</p></div>
              </article>
              <article className="panel reference-panel">
                <PanelHeading title="Risk review shortcuts" action="Model insights" onAction={() => setActivePage("Model Insights")} />
                <div className="insight-callout"><ShieldAlert size={20} /><div><strong>History-based screening</strong><p>Device familiarity and available transaction history are screening indicators, not causal explanations of the model score.</p></div></div>
                <div className="quick-links"><button onClick={() => setActivePage("Fraud Detection")}>Assess transaction <ArrowRight size={15} /></button><button onClick={() => setActivePage("Alerts")}>Review alerts <ArrowRight size={15} /></button></div>
              </article>
            </section>
          )}
          {(activePage === "Overview" || activePage === "Fraud Detection") && <section className="overview-grid">
            <article className="panel health-panel">
              <PanelHeading
                title="Risk Health Score"
                action="View details"
                onAction={() => setActivePage("Fraud Detection")}
              />
              <div className="health-content">
                <div className="score-container">
                  <div className="score-ring" style={{ background: `conic-gradient(${prediction ? (getDisplayRisk(prediction.fraud_probability).tone === "high" ? "#c34232" : getDisplayRisk(prediction.fraud_probability).tone === "medium" ? "#d99516" : "#168363") : "var(--orange)"} 0deg ${prediction ? Math.max(0, Math.min(1, Number(prediction.fraud_probability))) * 360 : 0}deg, #e8ebf1 0deg 360deg)` }}>
                    <div className="score-inner">
                      <strong>{prediction ? (Number(prediction.fraud_probability) * 100).toFixed(2) : "—"}</strong>
                      <span>% score</span>
                    </div>
                  </div>
                  <span className="score-caption">Transformer fraud probability</span>
                  <span className="score-tag">{prediction ? `${getDisplayRisk(prediction.fraud_probability).level} risk · ${getDisplayRisk(prediction.fraud_probability).decision}` : "Awaiting assessment"}</span>
                  <span className="score-caption">Bands: Low &lt;30% · Medium 30–&lt;90% · High ≥90%</span>
                </div>
                <div className="contributors">
                  <h3>Risk Contributors</h3>
                  {prediction?.history_features ? <>
                    <HistoryMetric label="Customer history · earlier transactions for this sender" value={prediction.history_features.customer_previous_count} />
                    <HistoryMetric label="Device familiarity · earlier transactions on this device" value={prediction.history_features.device_previous_count} />
                    <HistoryMetric label="New device · unfamiliar in available history (1 = yes)" value={Number(prediction.history_features.new_device) === 1 ? "Yes" : "No"} />
                  </> : <p className="contributors-empty">Run an assessment to display the main available history indicators. They describe recorded history and are not model-attributed fraud contributions.</p>}
                </div>
              </div>
            </article>
            <article className="panel trend-panel">
              <PanelHeading
                title="Risk Trend Timeline"
                action="Live prediction history"
                onAction={() => setActivePage("Reports")}
              />

              <div className="chart-wrap">
                {trendData.length === 0 ? (
                  <div className="empty-state">
                    No prediction history available yet.
                    Assess transactions to build this timeline.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 14, right: 12, left: 4, bottom: 8 }}
                    >
                      <CartesianGrid
                        stroke="#e9edf3"
                        strokeDasharray="3 3"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#858c9a", fontSize: 11 }}
                      />

                      <YAxis
                        allowDecimals={false}
                        domain={[0, "auto"]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#858c9a", fontSize: 11 }}
                        label={{
                          value: "Predictions",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#858c9a",
                          fontSize: 11,
                        }}
                      />

                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Saved predictions"
                        stroke="#ff781f"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />

                      <Line
                        type="monotone"
                        dataKey="highRisk"
                        name="High-risk predictions"
                        stroke="#27313f"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />

                      <Line
                        type="monotone"
                        dataKey="mediumRisk"
                        name="Medium-risk predictions"
                        stroke="#e5a000"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />

                      <Line
                        type="monotone"
                        dataKey="lowRisk"
                        name="Low-risk predictions"
                        stroke="#11a997"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-legend">
                <span><i className="orange-dot" /> Saved predictions</span>
                <span><i className="dark-dot" /> High-risk</span>
                <span><i className="medium-dot" /> Medium-risk</span>
                <span><i className="teal-dot" /> Low-risk</span>
              </div>
            </article>
          </section>}
          {(activePage === "Overview" || activePage === "Alerts") && <section className="panel alerts-panel">
            <PanelHeading
              title={activePage === "Overview" ? "Recent Alerts & Incidents" : "Saved Fraud Alerts"}
              action="Review alerts"
              onAction={() => setActivePage("Alerts")}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Alert / Transaction</th>
                    <th>Segment</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <span className={`severity-icon ${alert.severity.toLowerCase()}`}>
                          <CircleAlert size={17} />
                        </span>
                      </td>
                      <td>
                        <strong>{alert.message}</strong>
                        <small>Risk review required</small>
                      </td>
                      <td>{alert.segment}</td>
                      <td>{alert.time}</td>
                      <td>
                        <span className={`status ${alert.status.toLowerCase().replace(" ", "-")}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="transaction-id">{alert.id}</td>
                    </tr>
                  ))}
                  {filteredAlerts.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        No matching alerts. Try another search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>Showing {filteredAlerts.length} saved high-risk records</span>
              <span>Summary cards and high-risk alerts use saved API predictions</span>
            </div>
          </section>}
          {activePage === "Analytics" && (
            <section className="reference-page-grid">
              <article className="panel reference-panel wide"><PanelHeading title="Risk activity timeline" action={`${trendData.length} time buckets`} /><div className="reference-chart tall">{trendData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}><CartesianGrid stroke="#edf0f4" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="total" name="All predictions" stroke="#1477e8" strokeWidth={3} dot={{ r: 4 }} /><Line type="monotone" dataKey="highRisk" name="High risk" stroke="#dc3f3f" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="lowRisk" name="Low / other risk" stroke="#07866e" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <div className="empty-state">Assess transactions to populate this timeline with saved prediction data.</div>}</div></article>
              <article className="panel reference-panel"><PanelHeading title="Risk level summary" />{["High", "Medium", "Low"].map(risk => <div className="metric-line" key={risk}><span>{risk} risk</span><strong>{dashboardTransactions.filter(r => r.risk === risk).length}</strong></div>)}<p className="section-subtitle">Counts use saved records returned by the API, not the full training dataset.</p></article>
              <article className="panel reference-panel"><PanelHeading title="Transaction types" />{Object.entries(dashboardTransactions.reduce((acc, r) => { const k = r.transaction_type || "Unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).slice(0, 8).map(([type, count]) => <div className="metric-line" key={type}><span>{type}</span><strong>{count}</strong></div>)}{!dashboardTransactions.length && <div className="empty-state">No transaction type data is available yet.</div>}</article>
            </section>
          )}
          {activePage === "Customers" && (
            <section className="panel reference-panel"><PanelHeading title="Customers in saved predictions" action={`${new Set(dashboardTransactions.map(r => r.customer_id).filter(Boolean)).size} unique senders`} /><p className="section-subtitle">Summaries are derived only from saved prediction records currently available to this dashboard.</p><div className="table-scroll"><table><thead><tr><th>Customer ID</th><th>Predictions</th><th>High-risk records</th><th>Latest activity</th><th>Latest risk</th></tr></thead><tbody>{Object.entries(dashboardTransactions.reduce((acc, r) => { const id = r.customer_id || "Unknown"; if (!acc[id]) acc[id] = { count: 0, high: 0, latest: null }; acc[id].count++; if (r.risk === "High") acc[id].high++; if (!acc[id].latest || new Date(r.timestamp || 0) > new Date(acc[id].latest.timestamp || 0)) acc[id].latest = r; return acc; }, {})).filter(([id]) => id.toLowerCase().includes(search.toLowerCase())).map(([id, data]) => <tr key={id}><td><strong>{id}</strong></td><td>{data.count}</td><td>{data.high}</td><td>{data.latest?.timestamp ? new Date(data.latest.timestamp).toLocaleString() : "—"}</td><td><span className={`status ${(data.latest?.risk || "unknown").toLowerCase()}`}>{data.latest?.risk || "—"}</span></td></tr>)}{!dashboardTransactions.length && <tr><td colSpan="5" className="empty-state">No customer records loaded yet.</td></tr>}</tbody></table></div></section>
          )}
          {activePage === "Merchants" && (
            <section className="panel reference-panel"><PanelHeading title="Merchant activity" action="Available API fields only" /><p className="section-subtitle">The current API may not return a merchant ID. This table summarizes merchant-related fields actually present in saved records.</p><div className="table-scroll"><table><thead><tr><th>Merchant / category</th><th>Saved records</th><th>High risk</th><th>Countries</th></tr></thead><tbody>{Object.entries(dashboardTransactions.reduce((acc, r) => { const key = r.merchant_id || r.merchant_category || "Merchant not returned"; if (!acc[key]) acc[key] = { count: 0, high: 0, countries: new Set() }; acc[key].count++; if (r.risk === "High") acc[key].high++; if (r.merchant_country) acc[key].countries.add(r.merchant_country); return acc; }, {})).filter(([id]) => id.toLowerCase().includes(search.toLowerCase())).map(([id, data]) => <tr key={id}><td>{id}</td><td>{data.count}</td><td>{data.high}</td><td>{[...data.countries].join(", ") || "Not returned"}</td></tr>)}{!dashboardTransactions.length && <tr><td colSpan="4" className="empty-state">No merchant records are available yet.</td></tr>}</tbody></table></div></section>
          )}
          {activePage === "Model Insights" && (
            <section className="reference-page-grid"><article className="panel reference-panel"><PanelHeading title="Model status" /><div className="model-status"><span className="status-indicator" /> API status is confirmed by successful requests, not inferred from this screen.</div><div className="metric-line"><span>Prediction endpoint</span><strong>/predict</strong></div><div className="metric-line"><span>Architecture</span><strong>BiLSTM + Transformer</strong></div><div className="metric-line"><span>Previously reported ROC-AUC</span><strong>0.8657</strong></div><div className="metric-line"><span>Previously reported PR-AUC</span><strong>0.6259</strong></div><p className="section-subtitle">Reported test metrics from the current project context; verify the deployed model version before presenting them as live metrics.</p></article><article className="panel reference-panel"><PanelHeading title="Explanation limitations" /><div className="insight-callout"><BrainCircuit size={20} /><div><strong>History indicators are not SHAP values</strong><p>The UI displays selected history fields, not validated local feature attributions. It does not claim a feature caused a prediction.</p></div></div><div className="metric-line"><span>Display bands</span><strong>Low &lt;30%; Medium 30–&lt;90%; High ≥90%</strong></div><div className="metric-line"><span>Model threshold</span><strong>Check backend response / config</strong></div></article></section>
          )}
          {activePage === "Reports" && (
            <section className="panel reference-panel"><PanelHeading title="Reports & export" /><p className="section-subtitle">Exports contain records currently loaded from the API, not the entire source dataset.</p><div className="quick-links"><button onClick={() => downloadCsv("transfraud-transactions.csv", dashboardTransactions, ["record_id", "timestamp", "customer_id", "receiver_id", "amount", "transaction_type", "fraud_probability", "risk", "decision", "completed"])}><Download size={16} /> Export transactions CSV</button><button onClick={() => downloadCsv("transfraud-alerts.csv", alerts, ["id", "message", "segment", "time", "severity", "status"])}><Download size={16} /> Export alerts CSV</button><button onClick={() => window.print()}><FileText size={16} /> Print / save dashboard as PDF</button></div></section>
          )}
          {activePage === "Settings" && (
            <section className="reference-page-grid"><article className="panel reference-panel"><PanelHeading title="API configuration" /><div className="metric-line"><span>API base URL</span><strong>https://transfraud.onrender.com</strong></div><div className="metric-line"><span>Prediction route</span><strong>/predict</strong></div><div className="metric-line"><span>Summary route</span><strong>/dashboard/summary</strong></div><div className="metric-line"><span>Transactions route</span><strong>/dashboard/transactions</strong></div><p className="section-subtitle">This build uses the deployed API URL. Update API_BASE in App.jsx to change it.</p></article><article className="panel reference-panel"><PanelHeading title="Data coverage" /><div className="metric-line"><span>Saved records loaded</span><strong>{dashboardTransactions.length}</strong></div><div className="metric-line"><span>Alerts loaded</span><strong>{alerts.length}</strong></div><div className="metric-line"><span>Location risk used by model</span><strong>No</strong></div><p className="section-subtitle">Location analysis is marked unavailable until the backend schema and model support location features.</p></article></section>
          )}
          <footer className="page-footer">
            <span><span className="status-indicator" /> Dashboard interface ready</span>
            <span>TransFraud · Transformer-based fraud detection</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function RiskScorePanel({ prediction, amount, displayRisk }) {
  const probability = Math.max(0, Math.min(1, Number(prediction.fraud_probability || 0)));
  const score = probability * 100;
  const risk = displayRisk || getDisplayRisk(probability);
  const tone = risk.tone || (risk.level === "High" ? "high" : risk.level === "Medium" ? "medium" : "low");
  const palette = tone === "high"
    ? { color: "#dc3737", pale: "#fff0ef", border: "#ffd1ce", label: "High Risk", action: "Alert / Verify" }
    : tone === "medium"
      ? { color: "#d99516", pale: "#fff8e8", border: "#ffe1a3", label: "Medium Risk", action: "Review / Verify" }
      : { color: "#16a05d", pale: "#effaf4", border: "#c7efd9", label: "Low Risk", action: "Proceed" };

  const features = prediction.history_features || {};
  const deviceCount = Number(features.device_previous_count ?? 0);
  const merchantCount = Number(features.merchant_previous_count ?? 0);
  const customerDeviceCount = Number(features.customer_device_previous_count ?? 0);
  const customerCount = Number(features.customer_previous_count ?? 0);
  const isNewDevice = Number(features.new_device) === 1;
  const merchantId = String(prediction.merchant_id || "").trim();
  const merchantWasProvided = merchantId.length > 0 && !["UNKNOWN_MERCHANT", "UNKNOWN", "N/A", "NONE"].includes(merchantId.toUpperCase());
  const reasons = [];

  // These are history-based screening signals, not causal explanations of the neural model.
  // Do not flag transaction amount from an average alone: the API does not expose a
  // validated spending range, dispersion estimate, or customer-specific anomaly threshold.
  if (isNewDevice || customerDeviceCount === 0) {
    reasons.push({
      title: "Device not seen with this customer",
      description: customerDeviceCount === 0
        ? "No earlier transactions are recorded for this customer–device combination in the available history."
        : "The model's history features mark this device as new for the available transaction history."
    });
  } else if (deviceCount === 0) {
    reasons.push({
      title: "No device history found",
      description: "No earlier transactions are recorded for this device in the available history."
    });
  }

  if (merchantWasProvided && merchantCount === 0) {
    reasons.push({
      title: "Merchant not seen in available history",
      description: "No earlier transactions are recorded for the supplied merchant ID. This may reflect limited history, not fraud by itself."
    });
  }

  if (customerCount === 0) {
    reasons.push({
      title: "No prior customer history",
      description: "The history index contains no earlier transactions for this sender ID."
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      title: "No specific history warning found",
      description: "The available history fields did not meet the rule-based warning checks. The model score still reflects the full set of processed inputs."
    });
  }

  return <section className={`risk-score-panel risk-tone-${tone}`} aria-label="Risk score analysis">
    <div className="risk-score-topline"><h3><ShieldCheck size={19} /> Risk Score</h3><span className={`risk-status-pill ${tone}`}>{palette.label}</span></div>
    <div className="risk-score-summary">
      <div className="risk-score-probability">
        <div className="risk-score-ring" style={{ "--score-color": palette.color, "--score-angle": `${probability * 360}deg` }}>
          <div className="risk-score-ring-inner"><strong>{score.toFixed(2)}%</strong><span>Fraud probability</span></div>
        </div>
      </div>
      <div className="risk-score-detail"><span>Risk Level</span><strong className={`risk-score-level ${tone}`}>{palette.label}</strong><p>{tone === "high" ? "The model returned a high fraud probability. Review the indicators below before deciding." : tone === "medium" ? "The model returned a medium fraud probability. Additional verification is recommended." : "The model returned a low fraud probability. Continue normal checks."}</p></div>
      <div className="risk-score-detail action"><span>Recommended Action</span><strong className={`risk-score-action ${tone}`}>{palette.action}</strong><p>{prediction.analysis_duration_ms != null ? `Backend analysis: ${Number(prediction.analysis_duration_ms).toFixed(0)} ms` : "Based on the configured display risk bands"}</p></div>
    </div>
    <div className="risk-reasons-panel">
      <h4><AlertTriangle size={16} /> Risk analysis (reasons)</h4>
      <div className="risk-reasons-list">{reasons.map((reason, index) => <article className="risk-reason-row" key={`${reason.title}-${index}`}>
        <span className={`risk-reason-icon ${tone}`}>{tone === "low" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
        <div><strong>{reason.title}</strong><p>{reason.description}</p></div>
      </article>)}</div>
      <p className="risk-reasons-footnote">These are history-based screening indicators, not causal explanations of the model prediction. Amount anomalies are not asserted without a validated customer-specific threshold.</p>
    </div>
  </section>;
}

function RiskEvidencePanel({ prediction, transactions }) {
  const features = prediction.history_features || {};
  const evidence = [
    { label: "Earlier sender transactions", value: features.customer_previous_count, detail: "Recorded before this assessment" },
    { label: "Earlier device transactions", value: features.device_previous_count, detail: "History associated with this device" },
    { label: "Earlier merchant transactions", value: features.merchant_previous_count, detail: "Only meaningful when a merchant ID is supplied" },
    { label: "Device new to sender", value: Number(features.new_device) === 1 ? "Yes" : Number(features.new_device) === 0 ? "No" : "Unavailable", detail: "Derived from the available history index" },
  ];
  const recent = (transactions || []).slice(0, 7);
  const money = (value) => value == null || value === "" ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return <div className="reference-detail-grid">
    <section className="panel evidence-panel">
      <PanelHeading title="Risk assessment evidence" />
      <p className="section-subtitle">These values are returned by the API's history lookup. They are not feature-attribution scores and do not prove causation.</p>
      <div className="evidence-grid">{evidence.map((item) => <article className="evidence-card" key={item.label}>
        <span>{item.label}</span><strong>{item.value == null ? "—" : item.value}</strong><small>{item.detail}</small>
      </article>)}</div>
    </section>
    <section className="panel location-panel">
      <PanelHeading title="Location & distance analysis" />

      <div className="location-status">
        <div className="location-status-icon">●</div>

        <div>
          <strong>Location analysis unavailable</strong>

          <p>
            Sender and receiver coordinates are not currently
            provided by the prediction API. Geodesic distance
            and impossible-travel checks have not been evaluated.
          </p>
        </div>
      </div>
    </section>
    <section className="panel history-panel">
      <PanelHeading title="Transaction history" />
      {recent.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Sender → Receiver</th><th>Amount</th><th>Type</th><th>Risk</th><th>Decision</th></tr></thead><tbody>
        {recent.map((record, index) => <tr key={record.record_id || `${record.customer_id}-${record.timestamp}-${index}`}>
          <td>{record.timestamp ? new Date(record.timestamp).toLocaleString() : "—"}</td>
          <td>{record.customer_id || "—"} → {record.receiver_id || "—"}</td>
          <td>{money(record.amount)}</td><td>{record.transaction_type || "—"}</td>
          <td><span className={`status ${(record.risk || "unknown").toLowerCase()}`}>{record.risk || "—"}</span></td>
          <td>{record.decision || "—"}</td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state">No transaction history returned by the API yet.</div>}
    </section>
  </div>;
}

function StatCard({ icon, label, value, change, tone }) {
  return (
    <article className="panel stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className={`stat-change ${tone}`}>{change}</span>
    </article>
  );
}
function PanelHeading({ title, action, onAction }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {action && onAction && <button onClick={onAction}>{action} <span>↗</span></button>}
    </div>
  );
}
function HistoryMetric({ label, value }) {
  return <div className="history-metric"><span>{label}</span><strong>{Number(value || 0).toLocaleString()}</strong></div>;
}

export default App;
