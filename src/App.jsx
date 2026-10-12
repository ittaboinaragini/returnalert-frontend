import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8081/api/purchases";

function todayString() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function addMonths(dateString, months) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months));
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "Not set";
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(dateString) {
  if (!dateString) return -1;
  const today = new Date(`${todayString()}T00:00:00`);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function fromApi(item) {
  const purchaseDate = item.purchaseDate || todayString();
  const returnDate =
    item.returnDate ||
    addDays(purchaseDate, Math.max(0, Number(item.returnDays ?? 7) - 1));
  const warrantyDate =
    item.warrantyDate ||
    addMonths(purchaseDate, Number(item.warrantyMonths ?? 12));

  return {
    id: item.id,
    name: item.name || "",
    store: item.store || "",
    purchaseDate,
    returnDays: item.returnDays ?? 7,
    returnDate,
    warrantyMonths: item.warrantyMonths ?? 12,
    warrantyDate,
    price: item.price ?? "",
    notes: item.notes || "",
    status: item.status || (daysUntil(returnDate) >= 0 ? "ACTIVE" : "EXPIRED"),
  };
}

function toApi(product) {
  const returnDate =
    product.returnDate ||
    addDays(product.purchaseDate, Math.max(0, Number(product.returnDays || 0) - 1));
  const warrantyDate =
    product.warrantyDate ||
    addMonths(product.purchaseDate, Number(product.warrantyMonths || 0));

  return {
    name: product.name,
    store: product.store || "",
    purchaseDate: product.purchaseDate,
    returnDate: returnDate || null,
    warrantyDate: warrantyDate || null,
    returnDays: Number(product.returnDays || 0),
    warrantyMonths: Number(product.warrantyMonths || 0),
    price: product.price === "" || product.price == null ? null : Number(product.price),
    notes: product.notes || "",
  };
}

function App() {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState("welcome");
  const [authMode, setAuthMode] = useState("signup");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [activeInfo, setActiveInfo] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [message, setMessage] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [currency, setCurrency] = useState("₹");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [auth, setAuth] = useState({ name: "", email: "", password: "" });

  const emptyPurchase = {
    name: "",
    store: "",
    purchaseDate: todayString(),
    returnDays: "7",
    warrantyMonths: "12",
    price: "",
    notes: "",
  };
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);

  useEffect(() => {
    async function loadPurchases() {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Could not load purchases");
        const data = await response.json();
        setProducts(Array.isArray(data) ? data.map(fromApi) : []);
        setMessage("");
      } catch (error) {
        console.error("Failed to load purchases:", error);
        setMessage(
          "Could not connect to the backend. Make sure Spring Boot is running on port 8081, then refresh."
        );
      } finally {
        setLoading(false);
      }
    }
    loadPurchases();
  }, []);

  const purchasesWithDates = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        returnDate:
          product.returnDate ||
          addDays(product.purchaseDate, Math.max(0, Number(product.returnDays || 0) - 1)),
        warrantyDate:
          product.warrantyDate ||
          addMonths(product.purchaseDate, Number(product.warrantyMonths || 0)),
      })),
    [products]
  );

  const activeReturns = purchasesWithDates.filter((product) => daysUntil(product.returnDate) >= 0);
  const expiredReturns = purchasesWithDates.filter((product) => daysUntil(product.returnDate) < 0);
  const upcomingReturns = purchasesWithDates
    .filter((product) => {
      const days = daysUntil(product.returnDate);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => a.returnDate.localeCompare(b.returnDate));
  const upcomingWarranties = purchasesWithDates
    .filter((product) => {
      const days = daysUntil(product.warrantyDate);
      return days >= 0 && days <= 30;
    })
    .sort((a, b) => a.warrantyDate.localeCompare(b.warrantyDate));

  const filteredProducts = purchasesWithDates.filter((product) => {
    const query = search.toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(query) ||
      (product.store || "").toLowerCase().includes(query);
    const remaining = daysUntil(product.returnDate);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && remaining >= 0) ||
      (filter === "expired" && remaining < 0) ||
      (filter === "urgent" && remaining >= 0 && remaining <= 3);
    return matchesSearch && matchesFilter;
  });

  function openNewPurchase() {
    setEditingId(null);
    setPurchaseForm({ ...emptyPurchase, purchaseDate: todayString() });
    setShowForm(true);
    setMessage("");
  }

  function openEditPurchase(product) {
    setEditingId(product.id);
    setPurchaseForm({
      name: product.name || "",
      store: product.store || "",
      purchaseDate: product.purchaseDate || todayString(),
      returnDays: String(product.returnDays ?? 7),
      warrantyMonths: String(product.warrantyMonths ?? 12),
      price: product.price ?? "",
      notes: product.notes || "",
    });
    setShowForm(true);
    setMessage("");
  }

  async function savePurchase(event) {
    event.preventDefault();
    const name = purchaseForm.name.trim();
    if (!name || !purchaseForm.purchaseDate) {
      setMessage("Please enter a product name and purchase date.");
      return;
    }

    const returnDays = Math.max(0, Number(purchaseForm.returnDays || 0));
    const warrantyMonths = Math.max(0, Number(purchaseForm.warrantyMonths || 0));
    const purchase = {
      id: editingId,
      name,
      store: purchaseForm.store.trim(),
      purchaseDate: purchaseForm.purchaseDate,
      returnDays,
      returnDate: addDays(purchaseForm.purchaseDate, Math.max(0, returnDays - 1)),
      warrantyMonths,
      warrantyDate: addMonths(purchaseForm.purchaseDate, warrantyMonths),
      price: purchaseForm.price,
      notes: purchaseForm.notes.trim(),
    };

    setSaving(true);
    setMessage("");
    try {
      const isEditing = editingId !== null;
      const response = await fetch(
        isEditing ? `${API_URL}/${editingId}` : API_URL,
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toApi(purchase)),
        }
      );
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const saved = fromApi(await response.json());

      if (isEditing) {
        setProducts((current) => current.map((item) => (item.id === editingId ? saved : item)));
        setMessage("Purchase updated and saved to the database.");
      } else {
        setProducts((current) => [saved, ...current]);
        setMessage("Purchase added and saved to the database.");
      }
      setShowForm(false);
      setEditingId(null);
      setPurchaseForm({ ...emptyPurchase, purchaseDate: todayString() });
    } catch (error) {
      console.error("Failed to save purchase:", error);
      setMessage("Could not save the purchase. Check that the backend is running and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePurchase(id) {
    if (!window.confirm("Are you sure you want to delete this purchase?")) return;
    try {
      const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setProducts((current) => current.filter((product) => product.id !== id));
      setMessage("Purchase deleted from the database.");
    } catch (error) {
      console.error("Failed to delete purchase:", error);
      setMessage("Could not delete the purchase. Check that the backend is running.");
    }
  }

  function authenticate(event) {
    event.preventDefault();
    if (!auth.email.trim() || !auth.password.trim()) {
      setMessage("Please enter your email and password.");
      return;
    }
    if (authMode === "signup" && !auth.name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    setPage("home");
    setMessage("");
  }

  function exportBackup() {
    try {
      const file = new Blob([JSON.stringify(products, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "returnalert-backup.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSettingsMessage(`Backup prepared with ${products.length} purchase(s). Check your Downloads folder.`);
    } catch {
      setSettingsMessage("Backup failed. Please try again.");
    }
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data) || !data.every((item) => item && typeof item.name === "string" && typeof item.purchaseDate === "string")) {
        throw new Error("Invalid backup");
      }
      let count = 0;
      for (const item of data) {
        const normalized = {
          name: item.name,
          store: item.store || "",
          purchaseDate: item.purchaseDate,
          returnDays: Number(item.returnDays ?? 7),
          returnDate: item.returnDate || item.returnDate || addDays(item.purchaseDate, Math.max(0, Number(item.returnDays ?? 7) - 1)),
          replacementDate: item.replacementDate || item.replacementDeadline || "",
          warrantyMonths: Number(item.warrantyMonths ?? 12),
          warrantyDate: item.warrantyDate || item.warrantyDate || addMonths(item.purchaseDate, Number(item.warrantyMonths ?? 12)),
          price: item.price ?? "",
          notes: item.notes || "",
        };
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toApi(normalized)),
        });
        if (!response.ok) throw new Error("Could not restore all purchases");
        count += 1;
      }
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Could not reload purchases");
      setProducts((await response.json()).map(fromApi));
      setSettingsMessage(`Successfully restored ${count} purchase(s) to the database.`);
    } catch (error) {
      console.error("Restore failed:", error);
      setSettingsMessage("Could not restore this file. Choose a valid ReturnAlert JSON backup and check the backend.");
    } finally {
      event.target.value = "";
    }
  }

  async function deleteAllData() {
    if (!window.confirm("Delete all saved purchases? This cannot be undone unless you have a backup.")) return;
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Could not get purchases");
      const data = await response.json();
      for (const item of data) {
        const deleteResponse = await fetch(`${API_URL}/${item.id}`, { method: "DELETE" });
        if (!deleteResponse.ok) throw new Error("Could not delete all purchases");
      }
      setProducts([]);
      setSettingsMessage("All purchase records have been deleted from the database.");
    } catch (error) {
      console.error("Delete all failed:", error);
      setSettingsMessage("Could not delete all purchases. Check the backend and try again.");
    }
  }

  function closeInfo() {
    setActiveInfo("");
    setSettingsMessage("");
  }

  function changeMonth(amount) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function getCalendarEvents(dateString) {
    const events = [];
    purchasesWithDates.forEach((product) => {
      if (product.returnDate === dateString) {
        events.push({ id: `${product.id}-return`, name: product.name, type: "Return deadline" });
      }
      if (product.warrantyDate === dateString) {
        events.push({ id: `${product.id}-warranty`, name: product.name, type: "Warranty ends" });
      }
    });
    return events;
  }

  function renderProductCard(product) {
    const remaining = daysUntil(product.returnDate);
    const expired = remaining < 0;
    return (
      <article className="purchase-card" key={product.id}>
        <div className="product-icon">📦</div>
        <div className="product-info">
          <h3>{product.name}</h3>
          <p>{product.store || "Store not specified"}</p>
          <p className="muted">Purchased: {formatDate(product.purchaseDate)}</p>
          <div className="product-deadlines">
            <span className={expired ? "status expired" : "status active"}>
              {expired ? "Return period expired" : remaining === 0 ? "Return deadline today" : `${remaining} day(s) left`}
            </span>
            <p>Return by: {formatDate(product.returnDate)}</p>
            <p>Warranty: {formatDate(product.warrantyDate)}</p>
          </div>
          {product.price !== "" && product.price != null && <p className="product-price">Price: {currency}{product.price}</p>}
          {product.notes && <p className="muted">{product.notes}</p>}
          <div className="card-actions">
            <button className="secondary small-button" onClick={() => openEditPurchase(product)} type="button">Edit</button>
            <button className="danger small-button" onClick={() => deletePurchase(product.id)} type="button">Delete</button>
          </div>
        </div>
      </article>
    );
  }

  function renderPurchaseForm() {
    if (!showForm) return null;
    return (
      <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
        <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-form-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="modal-close" onClick={() => setShowForm(false)} aria-label="Close">✕</button>
          <h2 id="purchase-form-title">{editingId !== null ? "Edit purchase" : "Add a purchase"}</h2>
          <form className="app-form" onSubmit={savePurchase}>
            <label>Product name *
              <input required value={purchaseForm.name} onChange={(event) => setPurchaseForm({ ...purchaseForm, name: event.target.value })} placeholder="e.g. Headphones" />
            </label>
            <label>Store or website
              <input value={purchaseForm.store} onChange={(event) => setPurchaseForm({ ...purchaseForm, store: event.target.value })} placeholder="e.g. Amazon" />
            </label>
            <label>Purchase date *
              <input required type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, purchaseDate: event.target.value })} />
            </label>
            <div className="form-grid">
              <label>Return period (days)
                <input type="number" min="0" value={purchaseForm.returnDays} onChange={(event) => setPurchaseForm({ ...purchaseForm, returnDays: event.target.value })} />
              </label>
              <label>Warranty (months)
                <input type="number" min="0" value={purchaseForm.warrantyMonths} onChange={(event) => setPurchaseForm({ ...purchaseForm, warrantyMonths: event.target.value })} />
              </label>
            </div>
            <label>Price ({currency})
              <input type="number" min="0" step="0.01" value={purchaseForm.price} onChange={(event) => setPurchaseForm({ ...purchaseForm, price: event.target.value })} placeholder="Optional" />
            </label>
            <label>Notes
              <textarea rows="3" value={purchaseForm.notes} onChange={(event) => setPurchaseForm({ ...purchaseForm, notes: event.target.value })} placeholder="Optional details" />
            </label>
            {message && <p className="form-message">{message}</p>}
            <button className="primary full" type="submit" disabled={saving}>{saving ? "Saving..." : editingId !== null ? "Save changes" : "Add purchase"}</button>
          </form>
        </section>
      </div>
    );
  }

  function renderInfoModal() {
    if (!activeInfo) return null;
    return (
      <div className="modal-overlay" onClick={closeInfo}>
        <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="modal-close" onClick={closeInfo} aria-label="Close">✕</button>
          {activeInfo === "about" && <>
            <h2 id="info-modal-title">About ReturnAlert</h2>
            <p>ReturnAlert helps you record online purchases and keep track of return deadlines and warranty dates.</p>
            <p>Add a purchase to see its important dates in one place. You can edit records, search purchases, and create a backup.</p>
            <p className="muted">This is a student-project prototype. It does not currently send automatic notifications.</p>
          </>}
          {activeInfo === "privacy" && <>
            <h2 id="info-modal-title">Privacy Policy</h2>
            <p>This version stores purchase records in the ReturnAlert database through your local Spring Boot backend.</p>
            <p>The demonstration login screen does not create a real account or securely authenticate users. Do not enter a real password or confidential information.</p>
            <p className="muted">This is a basic project notice, not a complete legal privacy policy.</p>
          </>}
          {activeInfo === "terms" && <>
            <h2 id="info-modal-title">Terms of Use</h2>
            <p>ReturnAlert is a project prototype for recording purchase dates, return periods, and warranty information.</p>
            <p>The dates shown are calculated from the information you enter. Retailer policies may differ, so always confirm the actual deadline with the seller or manufacturer.</p>
            <p>This version does not guarantee reminders, refunds, replacements, or warranty claims.</p>
          </>}
          {activeInfo === "backup" && <>
            <h2 id="info-modal-title">Backup &amp; Restore</h2>
            <p>Save your purchase records as a JSON file, or restore records from a backup created by ReturnAlert.</p>
            <button type="button" className="primary full" onClick={exportBackup}>Download backup</button>
            <label className="restore-label">Restore from backup
              <input type="file" accept=".json,application/json" onChange={restoreBackup} />
            </label>
            <p className="muted">Restored purchases are added to your existing list. Restoring the same backup more than once may create duplicates.</p>
          </>}
          {settingsMessage && <p className="settings-feedback" role="status">{settingsMessage}</p>}
          <button type="button" className="secondary full modal-done" onClick={closeInfo}>Close</button>
        </section>
      </div>
    );
  }

  if (page === "welcome" || page === "auth") {
    return (
      <div className={`app-shell ${darkMode ? "dark" : "light"}`}>
        <div className="welcome-screen">
          <div className="brand-mark">↻</div>
          <p className="eyebrow">YOUR PERSONAL PURCHASE ASSISTANT</p>
          <h1>Never miss a <span>return deadline.</span></h1>
          <p className="welcome-description">Keep your purchases, return windows, and warranty dates organized in one simple place.</p>
          {page === "welcome" ? <>
            <div className="welcome-features">
              <div>✓ Track return deadlines</div>
              <div>✓ Keep warranty dates organized</div>
              <div>✓ Back up your purchase records</div>
            </div>
            <button className="primary full" onClick={() => { setAuthMode("signup"); setPage("auth"); setMessage(""); }}>Get started</button>
            <button className="text-button full" onClick={() => { setAuthMode("login"); setPage("auth"); setMessage(""); }}>Already have an account? Log in</button>
            <p className="muted welcome-note">Student project prototype · Data stored in your local database</p>
          </> : (
            <form className="auth-form" onSubmit={authenticate}>
              <h2>{authMode === "signup" ? "Create account" : "Welcome back"}</h2>
              {authMode === "signup" && <label>Your name
                <input value={auth.name} onChange={(event) => setAuth({ ...auth, name: event.target.value })} placeholder="Enter your name" required />
              </label>}
              <label>Email
                <input type="email" value={auth.email} onChange={(event) => setAuth({ ...auth, email: event.target.value })} placeholder="you@example.com" required />
              </label>
              <label>Password
                <input type="password" value={auth.password} onChange={(event) => setAuth({ ...auth, password: event.target.value })} placeholder="Enter any demo password" required />
              </label>
              {message && <p className="form-message">{message}</p>}
              <button className="primary full" type="submit">{authMode === "signup" ? "Create account" : "Log in"}</button>
              <button type="button" className="text-button full" onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setMessage(""); }}>{authMode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}</button>
              <button type="button" className="text-button full" onClick={() => { setPage("welcome"); setMessage(""); }}>Back to welcome</button>
              <p className="muted welcome-note">Demo only: this form does not create or verify real accounts.</p>
            </form>
          )}
        </div>
      </div>
    );
  }

  const monthYear = calendarMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarCells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  return (
    <div className={`app-shell ${darkMode ? "dark" : "light"}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")} type="button"><span className="brand-small">↻</span><span>ReturnAlert</span></button>
        <button className="avatar" type="button" title="Settings" onClick={() => setPage("settings")}>{(auth.name || auth.email || "R").charAt(0).toUpperCase()}</button>
      </header>
      <main className="main-content">
        {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")} type="button">✕</button></div>}
        {page === "home" && <>
          <section className="page-heading">
            <p className="eyebrow">YOUR PURCHASES, ORGANIZED</p>
            <h1>Good to see you{auth.name ? `, ${auth.name}` : ""}!</h1>
            <p className="muted">Stay ahead of your return and warranty deadlines.</p>
          </section>
          <section className="stats-grid">
            <article className="stat-card"><span className="stat-icon">📦</span><p>Total purchases</p><strong>{products.length}</strong></article>
            <article className="stat-card"><span className="stat-icon">↩️</span><p>Active return windows</p><strong>{activeReturns.length}</strong></article>
            <article className="stat-card"><span className="stat-icon">⏰</span><p>Due in 7 days</p><strong>{upcomingReturns.length}</strong></article>
            <article className="stat-card"><span className="stat-icon">🛡️</span><p>Expired returns</p><strong>{expiredReturns.length}</strong></article>
          </section>
          <section className="section-block">
            <div className="section-title-row"><div><h2>Upcoming deadlines</h2><p className="muted">Returns due in the next 7 days</p></div><button className="text-button" onClick={() => setPage("purchases")} type="button">View all</button></div>
            {loading ? <div className="empty-state"><p>Loading purchases...</p></div> : upcomingReturns.length ? <div className="purchase-list">{upcomingReturns.slice(0, 4).map(renderProductCard)}</div> : <div className="empty-state"><span>🎉</span><h3>You're all caught up!</h3><p>No return deadlines are coming up in the next 7 days.</p></div>}
          </section>
          <section className="section-block">
            <div className="section-title-row"><div><h2>Warranty watch</h2><p className="muted">Warranties ending in the next 30 days</p></div><button className="text-button" onClick={() => setPage("calendar")} type="button">Calendar</button></div>
            {upcomingWarranties.length ? <div className="simple-list">{upcomingWarranties.slice(0, 4).map((product) => <div className="simple-row" key={product.id}><span className="simple-icon">🛡️</span><div><strong>{product.name}</strong><p className="muted">Warranty ends {formatDate(product.warrantyDate)}</p></div></div>)}</div> : <div className="empty-state compact"><p>No warranties are ending in the next 30 days.</p></div>}
          </section>
          <button className="primary floating-add" onClick={openNewPurchase} type="button">+ Add purchase</button>
        </>}
        {page === "purchases" && <>
          <section className="page-heading"><p className="eyebrow">YOUR PERSONAL INVENTORY</p><h1>Purchases</h1><p className="muted">Manage your products and their important dates.</p></section>
          <div className="purchase-toolbar">
            <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or stores..." aria-label="Search purchases" />
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter purchases">
              <option value="all">All purchases</option><option value="active">Active returns</option><option value="urgent">Due in 3 days</option><option value="expired">Expired returns</option>
            </select>
          </div>
          <div className="section-title-row"><p className="muted">{filteredProducts.length} purchase(s) found</p><button className="primary" onClick={openNewPurchase} type="button">+ Add</button></div>
          {loading ? <div className="empty-state"><p>Loading purchases...</p></div> : filteredProducts.length ? <div className="purchase-list">{filteredProducts.map(renderProductCard)}</div> : <div className="empty-state"><span>📦</span><h3>No purchases found</h3><p>Add a purchase or change your search/filter.</p><button className="primary" onClick={openNewPurchase} type="button">Add your first purchase</button></div>}
        </>}
        {page === "calendar" && <>
          <section className="page-heading"><p className="eyebrow">IMPORTANT DATES</p><h1>Calendar</h1><p className="muted">View return and warranty deadlines by date.</p></section>
          <section className="calendar-card">
            <div className="calendar-header"><button className="secondary icon-button" onClick={() => changeMonth(-1)} type="button" aria-label="Previous month">‹</button><h2>{monthYear}</h2><button className="secondary icon-button" onClick={() => changeMonth(1)} type="button" aria-label="Next month">›</button></div>
            <div className="calendar-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
              {calendarCells.map((day, index) => {
                if (!day) return <div className="calendar-cell blank" key={`blank-${index}`} />;
                const dateString = [calendarMonth.getFullYear(), String(calendarMonth.getMonth() + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
                const events = getCalendarEvents(dateString);
                return <button type="button" key={dateString} className={`calendar-cell ${selectedDate === dateString ? "selected" : ""} ${dateString === todayString() ? "today" : ""}`} onClick={() => setSelectedDate(dateString)}><span>{day}</span>{events.length > 0 && <span className="calendar-dot" />}</button>;
              })}
            </div>
            <div className="calendar-legend"><span><i className="return-dot" /> Return deadline</span><span><i className="warranty-dot" /> Warranty end</span></div>
          </section>
          <section className="section-block"><h2>Events for {formatDate(selectedDate)}</h2>{getCalendarEvents(selectedDate).length ? <div className="simple-list">{getCalendarEvents(selectedDate).map((event) => <div className="simple-row" key={event.id}><span className="simple-icon">{event.type === "Return deadline" ? "↩️" : "🛡️"}</span><div><strong>{event.name}</strong><p className="muted">{event.type}</p></div></div>)}</div> : <div className="empty-state compact"><p>No saved deadlines on this date.</p></div>}</section>
        </>}
        {page === "settings" && <>
          <section className="page-heading"><p className="eyebrow">MAKE IT YOURS</p><h1>Settings</h1><p className="muted">Manage your preferences and saved records.</p></section>
          <section className="settings-card">
            <h2>Preferences</h2>
            <div className="setting-row"><div><strong>Reminders</strong><p className="muted">Reminder preference for this prototype</p></div><button type="button" role="switch" aria-checked={reminders} className={`toggle ${reminders ? "on" : ""}`} onClick={() => setReminders((value) => !value)}><span /></button></div>
            <div className="setting-row"><div><strong>Dark mode</strong><p className="muted">Change the appearance</p></div><button type="button" role="switch" aria-checked={darkMode} className={`toggle ${darkMode ? "on" : ""}`} onClick={() => setDarkMode((value) => !value)}><span /></button></div>
            <div className="setting-row"><div><strong>Currency</strong><p className="muted">Currency symbol for product prices</p></div><select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Currency"><option value="₹">INR (₹)</option><option value="$">USD ($)</option><option value="€">EUR (€)</option><option value="£">GBP (£)</option></select></div>
          </section>
          <section className="settings-card"><h2>Data management</h2>
            <button type="button" className="setting-action" onClick={() => { setSettingsMessage(""); setActiveInfo("backup"); }}><span className="setting-icon">💾</span><span className="setting-action-copy"><strong>Backup &amp; Restore</strong><small>Download or restore purchase records</small></span><span className="setting-arrow">›</span></button>
            <button type="button" className="setting-action" onClick={deleteAllData}><span className="setting-icon">🗑️</span><span className="setting-action-copy"><strong>Delete all purchases</strong><small>Remove all saved purchase records</small></span><span className="setting-arrow">›</span></button>
          </section>
          <section className="settings-card"><h2>About</h2>
            <button type="button" className="setting-action" onClick={() => setActiveInfo("about")}><span className="setting-icon">ℹ️</span><span className="setting-action-copy"><strong>About ReturnAlert</strong><small>Learn about this app</small></span><span className="setting-arrow">›</span></button>
            <button type="button" className="setting-action" onClick={() => setActiveInfo("privacy")}><span className="setting-icon">🔒</span><span className="setting-action-copy"><strong>Privacy Policy</strong><small>How this prototype handles your data</small></span><span className="setting-arrow">›</span></button>
            <button type="button" className="setting-action" onClick={() => setActiveInfo("terms")}><span className="setting-icon">📄</span><span className="setting-action-copy"><strong>Terms of Use</strong><small>Important information about using the app</small></span><span className="setting-arrow">›</span></button>
          </section>
          <button type="button" className="secondary full" onClick={() => { setPage("welcome"); setMessage(""); }}>Log out</button>
          <p className="muted settings-footnote">ReturnAlert prototype · Purchase records are stored in your local Spring Boot database. Automatic notifications and real authentication are not enabled.</p>
        </>}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {[{ id: "home", icon: "⌂", label: "Home" }, { id: "purchases", icon: "▤", label: "Purchases" }, { id: "calendar", icon: "▦", label: "Calendar" }, { id: "settings", icon: "⚙", label: "Settings" }].map((item) => <button key={item.id} type="button" className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setMessage(""); }}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
      </nav>
      {renderPurchaseForm()}
      {renderInfoModal()}
    </div>
  );
}

export default App;
