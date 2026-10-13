
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  ArrowLeftRight,
  ShieldAlert,
  Search,
  Users,
  Store,
  Settings,
  Bell,
  Download,
  SlidersHorizontal,
  FileText,
  Activity,
  Menu,
  X,
  ChevronDown,
  CircleAlert,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
        time: hourKey.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        total: 0,
        highRisk: 0,
        lowRisk: 0,
      });
    }

    const bucket = buckets.get(key);
    bucket.total += 1;
    if (record.risk === "High") bucket.highRisk += 1;
    else bucket.lowRisk += 1;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .slice(-12)
    .map(([, bucket]) => bucket);
}
const initialAlerts = [
  {
    id: "TXN-001",
    message: "Unusual transaction amount detected",
    segment: "Digital Payments",
    time: "2 min ago",
    status: "Monitoring",
    severity: "High",
  },
  {
    id: "TXN-002",
    message: "Transaction from a new device",
    segment: "UPI Payments",
    time: "5 min ago",
    status: "Investigating",
    severity: "Medium",
  },
  {
    id: "TXN-003",
    message: "Multiple transactions in a short period",
    segment: "Online Banking",
    time: "12 min ago",
    status: "Resolved",
    severity: "Low",
  },
  {
    id: "TXN-004",
    message: "Unusual customer transaction pattern",
    segment: "Digital Payments",
    time: "18 min ago",
    status: "Monitoring",
    severity: "High",
  },
];
const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Fraud Detection", icon: ShieldAlert },
  { label: "Investigations", icon: Search },
  { label: "Customers", icon: Users },
  { label: "Merchants", icon: Store },
  { label: "Rules & Models", icon: Settings },
  { label: "Alerts", icon: Bell },
  { label: "Reports", icon: FileText },
];
function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [showFilters, setShowFilters] = useState(false);
  const [predictionForm, setPredictionForm] = useState({
    customer_id: "CUST0000069",
    receiver_id: "TESTRECEIVER001",
    amount: "100",
    device_id: "TEST_DEVICE_001",
    merchant_id: "TEST_MERCHANT_001",
    merchant_category: "transfer",
    merchant_country: "IN",
    transaction_type: "transfer",
  });
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
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
          fetch("http://127.0.0.1:8000/dashboard/summary"),
          fetch("http://127.0.0.1:8000/dashboard/alerts?limit=100"),
          fetch("http://127.0.0.1:8000/dashboard/transactions?limit=100"),
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
    const payload = {
      ...predictionForm,
      amount: Number(predictionForm.amount),
    };
    try {
      const response = await fetch("http://127.0.0.1:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Prediction failed (HTTP ${response.status})`);
      }
      setPrediction(data);

      // Refresh summary, transaction history, and alerts immediately after a successful prediction.
      try {
        const [summaryResponse, alertsResponse, transactionsResponse] = await Promise.all([
          fetch("http://127.0.0.1:8000/dashboard/summary"),
          fetch("http://127.0.0.1:8000/dashboard/alerts?limit=100"),
          fetch("http://127.0.0.1:8000/dashboard/transactions?limit=100"),
        ]);

        if (!summaryResponse.ok || !alertsResponse.ok || !transactionsResponse.ok) {
          throw new Error("Prediction succeeded, but dashboard data could not be refreshed.");
        }

        const summaryData = await summaryResponse.json();
        const alertsData = await alertsResponse.json();
        const transactionsData = await transactionsResponse.json();

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
      } catch (refreshError) {
        setDashboardDataError(
          refreshError.message || "Prediction saved, but dashboard data did not refresh."
        );
      }

      setActivePage("Fraud Detection");
    } catch (error) {
      setPredictionError(
        error.message || "Could not reach the TransFraud API. Check that FastAPI is running."
      );
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
        `http://127.0.0.1:8000/transactions/${encodeURIComponent(record.record_id)}/complete`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `Completion failed (HTTP ${response.status})`);
      }

      const [summaryResponse, alertsResponse, transactionsResponse] = await Promise.all([
        fetch("http://127.0.0.1:8000/dashboard/summary"),
        fetch("http://127.0.0.1:8000/dashboard/alerts?limit=100"),
        fetch("http://127.0.0.1:8000/dashboard/transactions?limit=100"),
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
          <button className="select-control">
            All Payments <ChevronDown size={14} />
          </button>
          <button className="select-control">
            Last 24 hours <ChevronDown size={14} />
          </button>
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
          <button className="icon-button" aria-label="Notifications" onClick={() => setActivePage("Alerts")}>
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <button className="icon-button" aria-label="Settings" onClick={() => setActivePage("Rules & Models")}>
            <Settings size={19} />
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
                {activePage === "Overview"
                  ? "Monitor transaction risk and identify suspicious activity."
                  : `Review ${activePage.toLowerCase()} and monitor transaction risk.`}
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
          <section className="panel" style={{ marginBottom: 22, padding: 22 }}>
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
            Customer, card, device, and merchant history are retrieved by the backend from the saved dataset summary.
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
              ["customer_id", "Customer ID", "text"],
              ["receiver_id", "Receiver ID", "text"],
              ["amount", "Amount", "number"],
              ["device_id", "Device ID", "text"],
              ["merchant_id", "Merchant ID", "text"],
                        ].map(([name, label, type]) => (
              <label key={name} style={{ display: "grid", gap: 6, fontSize: 12, color: "#626b79" }}>
                {label}
                <input
                  name={name}
                  type={type}
                  min={type === "number" ? "0" : undefined}
                  step={name === "amount" || name === "customer_avg_previous_amount" ? "0.01" : "1"}
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
                />
              </label>
            ))}
            {[
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
                {label}
                <select
                  name={name}
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
          {predictionError && (
            <div role="alert" style={{ marginTop: 16, padding: 12, borderRadius: 8, color: "#a12828", background: "#fff0ef" }}>
              <strong>Prediction error:</strong> {predictionError}
            </div>
          )}
          {prediction && (
            <div style={{
              marginTop: 18,
              padding: 18,
              borderRadius: 10,
              border: `1px solid ${prediction.risk === "High" ? "#f2b9b1" : "#a7dfcb"}`,
              background: prediction.risk === "High" ? "#fff5f3" : "#f1fbf7",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#737d8b" }}>Transformer fraud probability</div>
                  <strong style={{ fontSize: 30, color: prediction.risk === "High" ? "#c34232" : "#168363" }}>
                    {(prediction.fraud_probability * 100).toFixed(2)}%
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#737d8b" }}>Risk level</div>
                  <strong style={{ fontSize: 18 }}>{prediction.risk}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#737d8b" }}>Recommended decision</div>
                  <strong>{prediction.decision}</strong>
                </div>
              </div>
              <p style={{ marginBottom: 0, color: "#737d8b", fontSize: 12 }}>
                Threshold: {(prediction.decision_threshold * 100).toFixed(2)}%. This is a model score, not proof of fraud.
                {prediction.history_note ? ` ${prediction.history_note}` : ""}
              </p>
              {prediction.history_features && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ display: "block", marginBottom: 10, fontSize: 13 }}>History features used by the model</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
                    {[
                      ["Customer previous transactions", prediction.history_features.customer_previous_count],
                      ["Customer average amount", prediction.history_features.customer_avg_previous_amount],
                      ["Card previous transactions", prediction.history_features.card_previous_count],
                      ["Device previous transactions", prediction.history_features.device_previous_count],
                      ["Merchant previous transactions", prediction.history_features.merchant_previous_count],
                      ["Customer-device previous transactions", prediction.history_features.customer_device_previous_count],
                      ["New device", prediction.history_features.new_device ? "Yes" : "No"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: 10, border: "1px solid #e3e8ef", borderRadius: 8, background: "#fff" }}>
                        <div style={{ fontSize: 11, color: "#737d8b", marginBottom: 5 }}>{label}</div>
                        <strong style={{ fontSize: 14 }}>{typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}</strong>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "#737d8b", marginBottom: 0 }}>
                    Source: {prediction.history_source || "backend"}.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
        {activePage === "Transactions" && (
          <section className="panel" style={{ marginBottom: 22, padding: 22 }}>
            <PanelHeading
              title="Saved Transaction Predictions"
              action={`${dashboardTransactions.length} records`}
              onAction={() => window.open("http://127.0.0.1:8000/dashboard/transactions", "_blank", "noopener,noreferrer")}
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
          <section className="overview-grid">
            <article className="panel health-panel">
              <PanelHeading
                title="Risk Health Score"
                action="View details"
                onAction={() => setActivePage("Fraud Detection")}
              />
              <div className="health-content">
                <div className="score-container">
                  <div className="score-ring">
                    <div className="score-inner">
                      <strong>72</strong>
                      <span>/ 100</span>
                    </div>
                  </div>
                  <span className="score-caption">Illustrative score</span>
                  <span className="score-tag">Elevated risk</span>
                </div>
                <div className="contributors">
                  <h3>Risk Contributors</h3>
                  <RiskBar label="Unusual velocity" value={68} />
                  <RiskBar label="New device activity" value={42} />
                  <RiskBar label="Location mismatch" value={34} />
                  <RiskBar label="Amount deviation" value={76} />
                  <RiskBar label="Unknown receiver" value={51} />
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
                    No saved predictions yet. Assess transactions to build this timeline.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 14, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#e9edf3" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#858c9a", fontSize: 11 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#858c9a", fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="total" name="Saved predictions" stroke="#ff781f" strokeWidth={2.5} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="highRisk" name="High-risk predictions" stroke="#27313f" strokeWidth={2.5} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="lowRisk" name="Low-risk predictions" stroke="#11a997" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="chart-legend">
                <span><i className="orange-dot" /> Saved predictions</span>
                <span><i className="dark-dot" /> High-risk predictions</span>
                <span><i className="teal-dot" /> Low-risk predictions</span>
              </div>
            </article>
          </section>
          <section className="panel alerts-panel">
            <PanelHeading
              title={activePage === "Overview" ? "Recent Alerts & Incidents" : `${activePage} Records`}
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
          </section>
          <footer className="page-footer">
            <span><span className="status-indicator" /> Dashboard interface ready</span>
            <span>TransFraud · Transformer-based fraud detection</span>
          </footer>
        </main>
      </div>
    </div>
  );
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
      <button onClick={onAction}>{action} <span>↗</span></button>
    </div>
  );
}
function RiskBar({ label, value }) {
  return (
    <div className="risk-bar-item">
      <div className="risk-bar-label">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
export default App;
