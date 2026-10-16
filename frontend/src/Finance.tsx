import { useEffect, useState } from "react";
import { list, number, object, text } from "./api";
import type { APIClient } from "./api";
import { Brand, Dialog } from "./components";
import { StudentSearch } from "./StudentSearch";
import { useI18n, useWords } from "./i18n";

export function FinanceOverview({
  api,
  version,
}: {
  api: APIClient;
  version: number;
}) {
  const w = useWords();
  const { formatNumber, formatDate } = useI18n();
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState(0);
  const [statement, setStatement] = useState<Record<string, unknown> | null>(
    null,
  );
  const [school, setSchool] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .request<Record<string, unknown>>("finance-summary/")
      .then((data) => {
        if (live) setSummary(data);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, version]);
  useEffect(() => {
    let live = true;
    setStatement(null);
    if (!student) return;
    Promise.all([
      api.request<Record<string, unknown>>(`students/${student}/statement/`),
      api.request<Record<string, unknown>>("school-context/"),
    ])
      .then(([data, context]) => {
        if (live) {
          setStatement(data);
          setSchool(object(context.school));
          setError("");
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, student, version]);
  return (
    <>
      <div className="finance-flow">
        <span>1. {w("Find student")}</span>
        <span>2. {w("Create invoice")}</span>
        <span>3. {w("Record payment")}</span>
        <span>4. {w("Print receipt")}</span>
        <button className="button secondary" onClick={() => setOpen(true)}>
          {w("Student statement")}
        </button>
      </div>
      <div className="finance-summary">
        {[
          ["Total billed", summary.total_due],
          ["Collected", summary.paid],
          ["Outstanding", summary.balance],
          ["Collected today", summary.collected_today],
        ].map(([label, value]) => (
          <div key={text(label)}>
            <span>{w(text(label))}</span>
            <strong>
              {formatNumber(number(value))} <small>AFN</small>
            </strong>
          </div>
        ))}
        <div>
          <span>{w("Overdue invoices")}</span>
          <strong>{number(summary.overdue)}</strong>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {open && (
        <Dialog title={w("Student statement")} onClose={() => setOpen(false)}>
          <div className="no-print">
            <StudentSearch api={api} value={student} onChange={setStudent} />
          </div>
          {statement && (
            <div className="print-surface">
              <Brand
                name={text(school.name)}
                logo={text(school.logo) || null}
              />
              <h2>
                {text(object(statement.student).name)} ·{" "}
                {text(object(statement.student).student_id)}
              </h2>
              <p>
                {text(object(statement.student).school_class_name)} ·{" "}
                {text(object(statement.student).father_name)}
              </p>
              <p>
                {w("Total billed")}:{" "}
                {formatNumber(number(object(statement.totals).total_due))} AFN ·{" "}
                {w("Collected")}:{" "}
                {formatNumber(number(object(statement.totals).paid))} AFN ·{" "}
                {w("Outstanding")}:{" "}
                {formatNumber(number(object(statement.totals).balance))} AFN
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Invoice",
                        "Billing month",
                        "Due date",
                        "Total due",
                        "Paid",
                        "Remaining",
                      ].map((label) => (
                        <th key={label}>{w(label)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list(statement.invoices).map((row) => (
                      <tr key={row.id}>
                        <td>
                          #{row.id} · {text(row.fee_type)}
                        </td>
                        <td>{text(row.billing_period) || "—"}</td>
                        <td>{formatDate(text(row.due_date))}</td>
                        <td>{text(row.total_due)}</td>
                        <td>{text(row.paid_amount)}</td>
                        <td>{text(row.remaining_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>{w("Payment history")}</h3>
              {list(statement.invoices).flatMap((invoice) =>
                list(invoice.payments).map((payment) => (
                  <p key={payment.id}>
                    #{payment.id} · {formatDate(text(payment.payment_date))} ·{" "}
                    {text(payment.amount)} AFN · {text(payment.payment_method)}{" "}
                    · {text(payment.notes)}
                  </p>
                )),
              )}
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                {w("Print statement")}
              </button>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
