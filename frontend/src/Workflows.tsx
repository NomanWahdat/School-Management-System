import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { APIError, list, number, object, text, allRows, today } from "./api";
import type { APIClient, Row } from "./api";
import {
  Dialog,
  Empty,
  Field,
  Heading,
  Loading,
  Status,
  Brand,
} from "./components";
import { useI18n, useWords } from "./i18n";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "Try again";
}

export function StudentDetails({
  api,
  student,
  admin,
}: {
  api: APIClient;
  student: Row;
  admin: boolean;
}) {
  const w = useWords();
  const { formatDate } = useI18n();
  const [guardians, setGuardians] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    relationship: "",
    phone_number: "",
    alternate_phone: "",
    is_emergency_contact: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<Record<string, unknown> | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    Promise.all([
      allRows(api, `guardians/?student=${student.id}`),
      allRows(api, `enrollments/?student=${student.id}`),
    ])
      .then(([g, h]) => {
        if (live) {
          setGuardians(g);
          setHistory(h);
        }
      })
      .catch((err) => {
        if (live) setError(errorText(err));
      });
    return () => {
      live = false;
    };
  }, [api, student.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await api.request<Row>("guardians/", {
        method: "POST",
        body: JSON.stringify({ ...values, student: student.id }),
      });
      setGuardians((old) => [...old, row]);
      setAdding(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <dl className="detail-grid">
        {[
          ["Student ID", student.student_id],
          ["Father / guardian name", student.father_name],
          ["Class", student.school_class_name],
          ["Contact number", student.contact_number],
          ["Address", student.address],
          ["Date of birth", formatDate(text(student.date_of_birth))],
        ].map(([label, value]) => (
          <div key={text(label)}>
            <dt>{w(text(label))}</dt>
            <dd>{text(value) || "—"}</dd>
          </div>
        ))}
      </dl>
      <button
        className="button primary"
        onClick={async () => {
          try {
            setDocument(
              await api.request(`students/${student.id}/report-card/`),
            );
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        {w("Report card")}
      </button>
      <section className="detail-section">
        <div className="section-title">
          <h3>{w("Guardians")}</h3>
          {admin && (
            <button
              className="button small secondary"
              onClick={() => setAdding(!adding)}
            >
              {w("Add guardian")}
            </button>
          )}
        </div>
        {guardians.length ? (
          guardians.map((row) => (
            <div className="history-row" key={row.id}>
              <div>
                <strong>{text(row.name)}</strong>
                <small>
                  {text(row.relationship)}
                  {row.is_emergency_contact
                    ? ` · ${w("Emergency contact")}`
                    : ""}
                </small>
              </div>
              <a href={`tel:${text(row.phone_number)}`}>
                {text(row.phone_number)}
              </a>
            </div>
          ))
        ) : (
          <p className="muted">{w("No records yet")}</p>
        )}
        {adding && (
          <form className="form-grid" onSubmit={submit}>
            {[
              ["name", "Guardian name"],
              ["relationship", "Relationship"],
              ["phone_number", "Phone number"],
              ["alternate_phone", "Alternative phone"],
            ].map(([key, label]) => (
              <Field
                label={w(label)}
                required={key !== "alternate_phone"}
                key={key}
              >
                {(id) => (
                  <input
                    id={id}
                    value={text(values[key])}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                    type={key.includes("phone") ? "tel" : "text"}
                    required={key !== "alternate_phone"}
                  />
                )}
              </Field>
            ))}
            <label className="check-label">
              <input
                type="checkbox"
                checked={Boolean(values.is_emergency_contact)}
                onChange={(e) =>
                  setValues({
                    ...values,
                    is_emergency_contact: e.target.checked,
                  })
                }
              />
              {w("Emergency contact")}
            </label>
            <button className="button primary" disabled={busy}>
              {w(busy ? "Saving…" : "Save")}
            </button>
          </form>
        )}
      </section>
      <section className="detail-section">
        <h3>{w("Enrollment history")}</h3>
        {history.map((row) => (
          <div className="history-row" key={row.id}>
            <strong>{text(row.class_name)}</strong>
            <span>{text(row.academic_year)}</span>
            <small>
              {formatDate(text(row.enrolled_at))}
              {row.ended_at ? ` – ${formatDate(text(row.ended_at))}` : ""}
            </small>
          </div>
        ))}
      </section>
      {error && (
        <p className="error-message" role="alert">
          {w(error)}
        </p>
      )}
      {document && (
        <Dialog title={w("Report card")} onClose={() => setDocument(null)}>
          <PrintDocument data={document} kind="report-card" />
        </Dialog>
      )}
    </>
  );
}

export function TeacherAccount({
  api,
  teacher,
  onClose,
  onSaved,
}: {
  api: APIClient;
  teacher: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = useWords();
  const hasAccount = Boolean(teacher.user);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.request(
        `teachers/${teacher.id}/account/${hasAccount ? "reset-password/" : ""}`,
        {
          method: "POST",
          body: JSON.stringify({
            username,
            email,
            temporary_password: password,
          }),
        },
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`${w("Account")} · ${text(teacher.name)}`} onClose={onClose}>
      {hasAccount && (
        <div className="notice">
          <strong>{text(teacher.account_username)}</strong>
          <Status value={teacher.account_status} />
          <button
            className="button small secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.request(`teachers/${teacher.id}/account/`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    status:
                      teacher.account_status === "Active"
                        ? "Inactive"
                        : "Active",
                  }),
                });
                onSaved();
                onClose();
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {w(
              teacher.account_status === "Active"
                ? "Deactivate account"
                : "Activate account",
            )}
          </button>
        </div>
      )}
      <form className="focused-form" onSubmit={submit}>
        {!hasAccount && (
          <>
            <Field label={w("Username")} required>
              {(id) => (
                <input
                  id={id}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  required
                />
              )}
            </Field>
            <Field label={w("Email")}>
              {(id) => (
                <input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
          </>
        )}
        <Field label={w("Temporary password")} required>
          {(id) => (
            <input
              id={id}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          )}
        </Field>
        <p className="muted">
          {w("The teacher must change this password at their next sign-in.")}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {w(
            busy ? "Saving…" : hasAccount ? "Reset password" : "Create account",
          )}
        </button>
      </form>
    </Dialog>
  );
}

export function PaymentForm({
  api,
  fee,
  onClose,
  onSaved,
}: {
  api: APIClient;
  fee: Row | null;
  onClose: () => void;
  onSaved: (row: Row) => void | Promise<void>;
}) {
  const w = useWords();
  const { formatNumber } = useI18n();
  const [fees, setFees] = useState<Row[]>(fee ? [fee] : []);
  const [selected, setSelected] = useState(fee?.id || 0);
  const [amount, setAmount] = useState(fee ? text(fee.remaining_amount) : "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Cash");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    if (!fee)
      allRows(api, "fees/")
        .then((rows) => {
          if (live)
            setFees(rows.filter((row) => number(row.remaining_amount) > 0));
        })
        .catch((err) => {
          if (live) setError(errorText(err));
        });
    return () => {
      live = false;
    };
  }, [api, fee]);
  const invoice = fees.find((row) => row.id === selected);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await api.request<Row>("fee-payments/", {
        method: "POST",
        body: JSON.stringify({
          fee: selected,
          amount,
          payment_date: date,
          payment_method: method,
          notes,
          request_id: requestId,
        }),
      });
      await onSaved(row);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={w("Record payment")} onClose={onClose}>
      <form className="focused-form" onSubmit={submit}>
        <Field label={w("Search student or invoice")}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={w("Student name or ID")}
          />
        </Field>
        <Field label={w("Payment reference / notes")}>
          <input
            maxLength={255}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Field label={w("Student")} required>
          {(id) => (
            <select
              id={id}
              value={selected || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelected(id);
                setAmount(
                  text(fees.find((row) => row.id === id)?.remaining_amount),
                );
              }}
              required
            >
              <option value="">{w("Select")}</option>
              {fees
                .filter((row) =>
                  `${row.student_name} ${row.student_number || ""} ${row.fee_type} ${row.billing_period} ${row.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((row) => (
                  <option value={row.id} key={row.id}>
                    {text(row.student_name)} · {text(row.fee_type)} ·{" "}
                    {formatNumber(number(row.remaining_amount))} AFN
                  </option>
                ))}
            </select>
          )}
        </Field>
        {invoice && (
          <div className="payment-balance">
            <span>{w("Remaining")}</span>
            <strong>
              {formatNumber(number(invoice.remaining_amount))}{" "}
              <small>AFN</small>
            </strong>
          </div>
        )}
        <Field label={w("Amount (AFN)")} required>
          {(id) => (
            <input
              id={id}
              type="number"
              step="0.01"
              min="0.01"
              max={number(invoice?.remaining_amount)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          )}
        </Field>
        <div className="form-grid">
          <Field label={w("Payment date")} required>
            {(id) => (
              <input
                id={id}
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={w("Payment method")} required>
            {(id) => (
              <select
                id={id}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {["Cash", "Bank transfer"].map((x) => (
                  <option key={x} value={x}>
                    {w(x)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            {w("Cancel")}
          </button>
          <button className="button primary" disabled={busy || !selected}>
            {w(busy ? "Saving…" : "Record payment")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PrintDocument({
  data,
  kind,
}: {
  data: Record<string, unknown>;
  kind: string;
}) {
  const w = useWords();
  const { formatNumber, formatDate } = useI18n();
  const school = object(data.school);
  const student = object(data.student);
  const payment = object(data.payment);
  return (
    <>
      <button
        className="button primary no-print"
        onClick={() => {
          document.body.dataset.print = "document";
          window.print();
          delete document.body.dataset.print;
        }}
      >
        {w("Print")}
      </button>
      <article className="print-surface">
        <Brand name={text(school.name)} logo={text(school.logo) || null} />
        <div className="document-title">
          <h2>{w(kind === "receipt" ? "Receipt" : "Report card")}</h2>
          <span>
            {kind === "receipt"
              ? text(data.receipt_number)
              : formatDate(today())}
          </span>
        </div>
        {kind === "receipt" ? (
          <>
            <dl className="detail-grid">
              {[
                ["Student", data.student],
                ["Student ID", data.student_id],
                ["Fee type", data.fee_type],
                ["Payment date", formatDate(text(payment.payment_date))],
                ["Payment method", payment.payment_method],
                ["Amount (AFN)", formatNumber(number(payment.amount))],
                ["Remaining", `${formatNumber(number(data.remaining))} AFN`],
              ].map(([label, value]) => (
                <div key={text(label)}>
                  <dt>{w(text(label))}</dt>
                  <dd>{text(value)}</dd>
                </div>
              ))}
            </dl>
            <p>
              {w("Recorded by")}: {text(data.recorded_by)}
            </p>
          </>
        ) : (
          <>
            <dl className="detail-grid">
              <div>
                <dt>{w("Student")}</dt>
                <dd>{text(student.name)}</dd>
              </div>
              <div>
                <dt>{w("Student ID")}</dt>
                <dd>{text(student.student_id)}</dd>
              </div>
              <div>
                <dt>{w("Class")}</dt>
                <dd>{text(student.school_class_name)}</dd>
              </div>
            </dl>
            <table>
              <thead>
                <tr>
                  {[
                    "Examination",
                    "Subject",
                    "Marks",
                    "Percentage",
                    "Grade",
                  ].map((x) => (
                    <th key={x}>{w(x)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list(data.results).map((row) => (
                  <tr key={row.id}>
                    <td>{text(row.exam_name)}</td>
                    <td>{text(row.subject)}</td>
                    <td>
                      {formatNumber(number(row.marks))}/
                      {formatNumber(number(row.total_marks))}
                    </td>
                    <td>{formatNumber(number(row.percentage))}%</td>
                    <td>{text(row.grade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list(data.results).length && <p>{w("No records yet")}</p>}
          </>
        )}
        <div className="document-signatures">
          <span>{w("School administration")}</span>
          <span>{w("Signature")}</span>
        </div>
      </article>
    </>
  );
}

export function MarksEntry({
  api,
  exam,
  classes,
  admin,
  onBack,
  onSaved,
}: {
  api: APIClient;
  exam: Row;
  classes: Row[];
  admin: boolean;
  onBack: () => void;
  onSaved: () => void;
}) {
  const w = useWords();
  const { formatNumber } = useI18n();
  const [students, setStudents] = useState<Row[]>([]);
  const [results, setResults] = useState<Row[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const maximum = number(exam.max_marks);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [s, r, dashboard] = await Promise.all([
        api.request<Row[]>(`exams/${exam.id}/roster/`),
        allRows(api, `results/?exam=${exam.id}`),
        admin ? Promise.resolve(null) : api.request<Row>("teacher-dashboard/"),
      ]);
      const subjects = Array.isArray(exam.subjects)
        ? exam.subjects.map(String)
        : [text(exam.subject)];
      const permitted = dashboard
        ? list(dashboard.assigned_classes_detail).find(
            (row) => row.id === number(exam.school_class),
          )?.subjects
        : subjects;
      if (live) {
        setStudents(s.filter((row) => row.is_active !== false));
        setResults(r);
        setAllowed(
          subjects.filter(
            (x) => Array.isArray(permitted) && permitted.includes(x),
          ),
        );
      }
    };
    load()
      .catch((err) => {
        if (live) setError(errorText(err));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [api, exam, admin]);
  useEffect(() => {
    setMarks(
      Object.fromEntries(
        results
          .filter((row) => row.subject === subject)
          .map((row) => [number(row.student), text(row.marks)]),
      ),
    );
  }, [subject, results]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const entries = students
        .filter((row) => marks[row.id] !== undefined && marks[row.id] !== "")
        .map((row) => ({
          student: row.id,
          exam: exam.id,
          subject,
          marks: Number(marks[row.id]),
          total_marks: maximum,
        }));
      if (!entries.length)
        throw new Error("Enter marks for at least one student.");
      const rows = await api.request<Row[]>("results/bulk/", {
        method: "POST",
        body: JSON.stringify(entries),
      });
      setResults((previous) => [
        ...previous.filter((row) => row.subject !== subject),
        ...rows,
      ]);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button className="text-button back-button" onClick={onBack}>
        ← {w("Back")} · {w("Exams & results")}
      </button>
      <Heading
        title={w("Enter results")}
        description={`${text(exam.name)} · ${text(classes.find((row) => row.id === number(exam.school_class))?.name)}`}
      />
      <section className="records-panel">
        <div className="record-toolbar">
          <Field label={w("Subject")} required>
            {(id) => (
              <select
                id={id}
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setSaved(false);
                }}
              >
                <option value="">{w("Select")}</option>
                {allowed.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="marks-limit">
            <span>{w("Maximum marks")}</span>
            <strong>{formatNumber(maximum)}</strong>
          </div>
        </div>
        {busy ? (
          <Loading />
        ) : !subject ? (
          <Empty title={w("Select a subject to begin.")} />
        ) : (
          <form onSubmit={submit}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {["Student", "Student ID", "Marks", "Percentage"].map(
                      (x) => (
                        <th key={x}>{w(x)}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => (
                    <tr key={row.id}>
                      <td>{text(row.name)}</td>
                      <td>{text(row.student_id)}</td>
                      <td>
                        <input
                          className="marks-input"
                          aria-label={`${w("Marks")} · ${text(row.name)}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max={maximum}
                          value={marks[row.id] ?? ""}
                          onChange={(e) => {
                            setMarks((current) => ({
                              ...current,
                              [row.id]: e.target.value,
                            }));
                            setSaved(false);
                          }}
                        />
                      </td>
                      <td>
                        {marks[row.id] !== undefined && marks[row.id] !== ""
                          ? `${formatNumber(Math.round((Number(marks[row.id]) / maximum) * 100))}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && (
              <p className="error-message" role="alert">
                {w(error)}
              </p>
            )}
            <div className="form-footer sticky-footer">
              <span className={saved ? "save-state saved" : "save-state"}>
                {w(saved ? "Saved" : "Not saved")} ·{" "}
                {formatNumber(
                  Object.values(marks).filter((x) => x !== "").length,
                )}
                /{formatNumber(students.length)}
              </span>
              <button className="button primary" disabled={saving}>
                {w(saving ? "Saving…" : "Save marks")}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

export function ResultsReview({
  api,
  exam,
  onBack,
}: {
  api: APIClient;
  exam: Row;
  onBack: () => void;
}) {
  const w = useWords();
  const { formatNumber } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    allRows(api, `results/?exam=${exam.id}`)
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((err) => {
        if (live) setError(errorText(err));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [api, exam.id]);
  const visible = rows.filter(
    (row) =>
      (!subject || row.subject === subject) &&
      text(row.student_name)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <button className="text-button back-button" onClick={onBack}>
        ← {w("Back")}
      </button>
      <Heading title={w("View results")} description={text(exam.name)}>
        <button className="button primary" onClick={() => window.print()}>
          {w("Print")}
        </button>
      </Heading>
      <section className="records-panel">
        <div className="report-title">
          <Brand
            name={api.session?.school?.name || ""}
            logo={api.session?.school?.logo}
          />
        </div>
        <div className="record-toolbar">
          <Field label={w("Search")}>
            {(id) => (
              <input
                id={id}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </Field>
          <Field label={w("Subject")}>
            {(id) => (
              <select
                id={id}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">{w("All subjects")}</option>
                {[...new Set(rows.map((row) => text(row.subject)))].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            )}
          </Field>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        {busy ? (
          <Loading />
        ) : visible.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["Student", "Subject", "Marks", "Percentage", "Grade"].map(
                    (label) => (
                      <th key={label}>{w(label)}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>{text(row.student_name)}</td>
                    <td>{text(row.subject)}</td>
                    <td>
                      {formatNumber(number(row.marks))}/
                      {formatNumber(number(row.total_marks))}
                    </td>
                    <td>{formatNumber(number(row.percentage))}%</td>
                    <td>{text(row.grade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={w("No matching records")} />
        )}
      </section>
    </>
  );
}

export function PromotionForm({
  api,
  onClose,
  onSaved,
}: {
  api: APIClient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = useWords();
  const [classes, setClasses] = useState<Row[]>([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [students, setStudents] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    allRows(api, "classes/")
      .then((rows) => {
        if (live) setClasses(rows);
      })
      .catch((err) => {
        if (live) setError(errorText(err));
      });
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    let live = true;
    setSelected([]);
    setStudents([]);
    if (source)
      allRows(api, `students/?school_class=${source}`)
        .then((rows) => {
          if (live) setStudents(rows.filter((row) => row.is_active !== false));
        })
        .catch((err) => {
          if (live) setError(errorText(err));
        });
    return () => {
      live = false;
    };
  }, [api, source]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.request("promotions/", {
        method: "POST",
        body: JSON.stringify({
          from_class: Number(source),
          to_class: Number(destination),
          students: selected,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={w("Promote students")} onClose={onClose}>
      <p>
        {w(
          "Previous attendance, results, and fees will stay in the original class.",
        )}
      </p>
      <form className="focused-form" onSubmit={submit}>
        <div className="form-grid">
          {[
            ["From class", source, setSource],
            ["To class", destination, setDestination],
          ].map(([label, value, setter]) => (
            <Field key={String(label)} label={w(String(label))} required>
              {(id) => (
                <select
                  id={id}
                  value={value as string}
                  onChange={(e) =>
                    (setter as (x: string) => void)(e.target.value)
                  }
                  required
                >
                  <option value="">{w("Select")}</option>
                  {classes
                    .filter(
                      (row) =>
                        label === "From class" ||
                        (row.status === "Active" && String(row.id) !== source),
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {text(row.name)} · {text(row.academic_year)}
                      </option>
                    ))}
                </select>
              )}
            </Field>
          ))}
        </div>
        {students.length > 0 && (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={() => setSelected(students.map((row) => row.id))}
            >
              {w("Select all")}
            </button>
            <div className="student-checklist">
              {students.map((row) => (
                <label key={row.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, row.id]
                          : old.filter((id) => id !== row.id),
                      )
                    }
                  />
                  {text(row.name)} <small>{text(row.student_id)}</small>
                </label>
              ))}
            </div>
          </>
        )}
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || selected.length === 0}
        >
          {w(busy ? "Saving…" : "Confirm promotion")}
        </button>
      </form>
    </Dialog>
  );
}
