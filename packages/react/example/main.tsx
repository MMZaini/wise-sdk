import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountCard } from "../src/index.js";
import "../styles.css";
import "./page.css";

function App() {
  const [visible, setVisible] = useState(false);
  return <main>
    <div className="page-heading">
      <div><p className="eyebrow">DEMO DATA</p><h1>Your balances</h1><p className="intro">Account details for receiving money in each currency.</p></div>
      <button type="button" aria-pressed={visible} aria-controls="accounts" onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"} account details</button>
    </div>
    <div id="accounts" className="account-grid">
      <AccountCard account={{ title: "British pound", currency: { code: "GBP" }, status: "ACTIVE", receiveOptions: [
        { type: "LOCAL", title: "Local account details", details: [
          { type: "ACCOUNT_NUMBER", title: "Account number", body: "12345678" },
          { type: "SORT_CODE", title: "Sort code", body: "04-00-00" },
        ] },
      ] }} balance={{ currency: "GBP", amount: { currency: "GBP", value: "2486.50" } }} masked={!visible}>
        <span className="footer-note">Receive GBP with local account details.</span>
      </AccountCard>
      <AccountCard account={{ title: "Euro", currency: { code: "EUR" }, status: "ACTIVE", receiveOptions: [
        { type: "INTERNATIONAL", title: "International account details", details: [
          { type: "IBAN", title: "IBAN", body: "BE00 0000 0000 0000" },
          { type: "SWIFT_CODE", title: "BIC / SWIFT", body: "TESTBEBBXXX" },
        ] },
      ] }} balance={{ currency: "EUR", amount: { currency: "EUR", value: "856.24" } }} masked={!visible}>
        <span className="footer-note">Check the receive option before sharing details.</span>
      </AccountCard>
    </div>
    <section className="states" aria-label="Loading and error examples">
      <h2>Account states</h2>
      <div className="account-grid">
        <AccountCard title="Loading" status="loading" />
        <AccountCard title="Unavailable" status="error" />
      </div>
    </section>
    <p className="page-note">Community components. All balances and account details shown here are fictional.</p>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
