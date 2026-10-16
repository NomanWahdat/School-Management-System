import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { APIError, list, number, object, text, allRows } from "./api";
import type { APIClient, Page, Row, Session } from "./api";
import type { Catalog, FieldSpec } from "./catalog";
import { catalogs } from "./catalog";
import { StudentSearch } from "./StudentSearch";
import { FinanceOverview } from "./Finance";
import {
  Dialog,
  Empty,
  Field,
  Heading,
  Icon,
  Loading,
  Status,
} from "./components";
import { useI18n, useWords } from "./i18n";
import {
  StudentDetails,
  TeacherAccount,
  MarksEntry,
  PaymentForm,
  PrintDocument,
  ResultsReview,
} from "./Workflows";

export function FormField({
  spec,
  values,
  setValues,
  references,
  error,
  locked = false,
}: {
  spec: FieldSpec;
  values: Record<string, unknown>;
  setValues: (value: Record<string, unknown>) => void;
  references: Record<string, Row[]>;
  error?: string;
  locked?: boolean;
}) {
  const w = useWords();
  const [subjectDraft, setSubjectDraft] = useState("");
  const update = (value: unknown) =>
    setValues({ ...values, [spec.key]: value });
  const value = values[spec.key];
  let options: { value: string; label: string }[] =
    spec.options?.map((item) => ({ value: item, label: w(item) })) || [];
  if (spec.source) {
    let choices = references[spec.source] || [];
    if (spec.source === "teachers" && values.school_class)
      choices = choices.filter(
        (item) =>
          Array.isArray(item.assigned_classes) &&
          item.assigned_classes
            .map(String)
            .includes(String(values.school_class)),
      );
    options = choices
      .filter((row) => row.status !== "Inactive" || row.id === number(value))
      .map((row) => ({
        value: String(row.id),
        label: text(row.name) + (row.student_id ? ` (${row.student_id})` : ""),
      }));
  }
  if (spec.type === "subjects") {
    const selected = (references.classes || []).find(
      (row) => row.id === number(values.school_class),
    );
    const subjects = Array.isArray(selected?.available_subjects)
      ? selected.available_subjects
      : Array.isArray(selected?.subjects)
        ? selected.subjects
        : [];
    options = subjects.map((item) => ({
      value: String(item),
      label: String(item),
    }));
  }
  if (spec.multiple)
    return (
      <fieldset className="field checkbox-field">
        <legend>
          {w(spec.label)}
          {spec.required ? " *" : ""}
        </legend>
        {options.length ? (
          <div className="checkbox-options">
            {options.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(value) &&
                    value.map(String).includes(option.value)
                  }
                  onChange={(event) => {
                    const current = Array.isArray(value) ? value : [];
                    update(
                      event.target.checked
                        ? [
                            ...current,
                            spec.source ? Number(option.value) : option.value,
                          ]
                        : current.filter((x) => String(x) !== option.value),
                    );
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : (
          <small>{w("Choose a class to begin.")}</small>
        )}
        {error && <small className="error-message">{w(error)}</small>}
      </fieldset>
    );
  return (
    <Field
      label={w(spec.label)}
      required={spec.required}
      error={error ? w(error) : undefined}
    >
      {(id) => {
        if (spec.type === "boolean")
          return (
            <select
              id={id}
              value={value === false ? "false" : "true"}
              onChange={(e) => update(e.target.value === "true")}
            >
              <option value="true">{w("Active")}</option>
              <option value="false">{w("Inactive")}</option>
            </select>
          );
        if (spec.source || spec.options || spec.type === "subjects")
          return (
            <select
              id={id}
              value={text(value)}
              onChange={(e) =>
                update(spec.source ? number(e.target.value) : e.target.value)
              }
              required={spec.required}
              disabled={locked}
            >
              <option value="">{w("Select")}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        if (spec.type === "textarea")
          return (
            <textarea
              id={id}
              rows={4}
              value={text(value)}
              onChange={(e) => update(e.target.value)}
              required={spec.required}
            />
          );
        if (spec.type === "tags") {
          const subjects = Array.isArray(value)
            ? value.map(String)
            : text(value).split(",").filter(Boolean);
          const add = () => {
            if (subjectDraft.trim()) {
              update([...new Set([...subjects, subjectDraft.trim()])]);
              setSubjectDraft("");
            }
          };
          return (
            <div>
              <div className="subject-add">
                <input
                  id={id}
                  value={subjectDraft}
                  onBlur={add}
                  placeholder={w("Subject")}
                  onChange={(event) => setSubjectDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add();
                    }
                  }}
                  required={Boolean(spec.required && subjects.length === 0)}
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={add}
                >
                  {w("Add subject")}
                </button>
              </div>
              <div className="subject-chips">
                {subjects.map((subject) => (
                  <span key={subject}>
                    {subject}
                    <button
                      type="button"
                      aria-label={`${w("Remove")} ${subject}`}
                      onClick={() =>
                        update(subjects.filter((item) => item !== subject))
                      }
                    >
                      {w("Remove")}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        }
        return (
          <input
            id={id}
            type={spec.type || "text"}
            value={text(value)}
            step={spec.type === "number" ? "0.01" : undefined}
            min={spec.type === "number" ? "0" : undefined}
            autoComplete={spec.type === "tel" ? "tel" : undefined}
            onChange={(e) =>
              update(
                spec.type === "number"
                  ? e.target.value === ""
                    ? ""
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
            required={spec.required}
            disabled={locked}
          />
        );
      }}
    </Field>
  );
}

export function RecordEditor({
  api,
  catalog,
  record,
  year,
  initialClass,
  references,
  onBack,
  onSaved,
}: {
  api: APIClient;
  catalog: Catalog;
  record: Row | null;
  year: string;
  initialClass: string;
  references: Record<string, Row[]>;
  onBack: () => void;
  onSaved: () => void;
}) {
  const w = useWords();
  const [values, setValues] = useState<Record<string, unknown>>({
    ...catalog.defaults,
    academic_year: year,
    ...(initialClass ? { school_class: Number(initialClass) } : {}),
    ...record,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [curriculum, setCurriculum] = useState<Row[]>([]);
  useEffect(() => {
    if (catalog.endpoint !== "classes") return;
    let live = true;
    api
      .request<{ grades: Row[] }>("curriculum/")
      .then((data) => {
        if (live) setCurriculum(data.grades);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, catalog.endpoint]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setBusy(true);
    const payload = Object.fromEntries(
      catalog.fields
        .map((spec) => {
          let value = values[spec.key];
          if (spec.type === "tags")
            value = Array.isArray(value)
              ? value.filter((x) => String(x).trim())
              : text(value)
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
          if (spec.type === "datetime-local" && value)
            value = new Date(`${value}+04:30`).toISOString();
          return [spec.key, value === "" && !spec.required ? null : value];
        })
        .filter(([, value]) => value !== undefined),
    );
    if (catalog.endpoint === "announcements" && payload.audience !== "Class")
      payload.school_class = null;
    if (catalog.endpoint === "exams")
      payload.subject = Array.isArray(payload.subjects)
        ? payload.subjects[0]
        : "";
    if (catalog.endpoint === "fees") payload.total_due = payload.amount;
    if (record && catalog.endpoint === "students") delete payload.school_class;
    try {
      await api.request(
        `${catalog.endpoint}/${record ? `${record.id}/` : ""}`,
        { method: record ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      onSaved();
    } catch (err) {
      if (err instanceof APIError)
        setErrors({ ...err.fields, detail: err.message });
    } finally {
      setBusy(false);
    }
  }
  const visible = catalog.fields.filter(
    (spec) =>
      !(
        spec.key === "school_class" &&
        catalog.endpoint === "announcements" &&
        values.audience !== "Class"
      ),
  );
  const render = (spec: FieldSpec) =>
    spec.source === "students" ? (
      <StudentSearch
        key={spec.key}
        api={api}
        value={number(values[spec.key])}
        initial={
          (references.students || []).find(
            (row) => row.id === number(values[spec.key]),
          ) ||
          (values.student_name
            ? {
                id: number(values.student),
                name: values.student_name,
                student_id: values.student_number,
                school_class_name: values.class_name,
              }
            : undefined)
        }
        onChange={(id) => setValues({ ...values, [spec.key]: id })}
      />
    ) : (
      <FormField
        key={spec.key}
        spec={spec}
        values={values}
        setValues={setValues}
        references={references}
        error={errors[spec.key]}
        locked={Boolean(
          record &&
          catalog.endpoint === "students" &&
          spec.key === "school_class",
        )}
      />
    );
  return (
    <>
      <button className="text-button back-button" onClick={onBack}>
        ← {w("Back")} · {w(catalog.title)}
      </button>
      <Heading
        title={`${w(record ? "Edit" : "Add")} ${w(catalog.singular)}`}
        description={w("Complete the required fields, then save.")}
      />
      <form className="focused-form editor-form" onSubmit={submit}>
        {catalog.endpoint === "classes" && (
          <div className="curriculum-helper">
            <p>
              {w(
                "Grades 1–12 can have multiple sections, such as Class 1 A and Class 1 B.",
              )}
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={!values.grade}
              onClick={() => {
                const template = curriculum.find(
                  (row) => String(row.grade) === String(values.grade),
                );
                if (template)
                  setValues({
                    ...values,
                    name: `Class ${values.grade}${values.section ? ` ${text(values.section).toUpperCase()}` : ""}`,
                    subjects: template.subjects,
                  });
              }}
            >
              {w("Use grade subject template")}
            </button>
            <small>
              {w("Review the subjects with your school before saving.")}
            </small>
          </div>
        )}
        <div className="form-grid">
          {visible.filter((spec) => !spec.optional).map(render)}
        </div>
        {visible.some((spec) => spec.optional) && (
          <details className="additional-details">
            <summary>{w("Additional details")}</summary>
            <div className="form-grid">
              {visible.filter((spec) => spec.optional).map(render)}
            </div>
          </details>
        )}
        {errors.detail && (
          <p className="error-message" role="alert">
            {w(errors.detail)}
          </p>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onBack}>
            {w("Cancel")}
          </button>
          <button className="button primary" disabled={busy}>
            {w(busy ? "Saving…" : "Save")}
          </button>
        </div>
      </form>
    </>
  );
}

export function RecordsPage({
  api,
  session,
  section,
  year,
  initialClass,
  onClassChange,
  onNavigate,
  intent,
  onIntentUsed,
}: {
  api: APIClient;
  session: Session;
  section: string;
  year: string;
  initialClass: string;
  onClassChange: (id: string) => void;
  onNavigate: (page: string, intent?: string, classId?: string) => void;
  intent?: string;
  onIntentUsed: () => void;
}) {
  const catalog = catalogs[section];
  const admin = session.user.role === "admin";
  const canWrite = admin || section === "homework";
  const w = useWords();
  const { formatNumber, formatDate } = useI18n();
  const [records, setRecords] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState(initialClass);
  const [moreFilters, setMoreFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("");
  const [references, setReferences] = useState<Record<string, Row[]>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ record: Row | null } | null>(
    intent === "add" ? { record: null } : null,
  );
  const [detail, setDetail] = useState<Row | null>(null);
  const [archive, setArchive] = useState<Row | null>(null);
  const [account, setAccount] = useState<Row | null>(null);
  const [exam, setExam] = useState<Row | null>(null);
  const [reviewExam, setReviewExam] = useState<Row | null>(null);
  const [payment, setPayment] = useState<{ fee: Row | null } | null>(
    intent === "pay" ? { fee: null } : null,
  );
  const [document, setDocument] = useState<Record<string, unknown> | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (intent) onIntentUsed();
  }, [intent, onIntentUsed]);
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), search: query });
    if (classFilter) params.set("school_class", classFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (sort) params.set("ordering", sort);
    api
      .request<Page<Row>>(`${catalog.endpoint}/?${params}`)
      .then((data) => {
        if (live) {
          setRecords(data.results);
          setCount(data.count);
        }
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [
    api,
    catalog.endpoint,
    page,
    query,
    classFilter,
    statusFilter,
    sort,
    revision,
  ]);
  useEffect(() => {
    let live = true;
    const sources = new Set([
      "classes",
      ...catalog.fields
        .map((spec) => spec.source)
        .filter((x): x is string => Boolean(x)),
    ]);
    if (!admin) sources.delete("teachers");
    sources.delete("students");
    Promise.all(
      [...sources].map(
        async (source) => [source, await allRows(api, `${source}/`)] as const,
      ),
    )
      .then((entries) => {
        if (live) setReferences(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, catalog, admin, revision]);
  const refresh = () => {
    setRevision((value) => value + 1);
    setNotice(w("Saved successfully"));
  };
  function display(row: Row, key: string) {
    const value = row[key];
    if (key === "is_active")
      return <Status value={value === false ? "Inactive" : "Active"} />;
    if (key.includes("status")) return <Status value={value} />;
    if (["school_class", "teacher", "student"].includes(key))
      return (
        text(
          references[
            key === "school_class"
              ? "classes"
              : key === "teacher"
                ? "teachers"
                : "students"
          ]?.find((x) => x.id === number(value))?.name,
        ) || "—"
      );
    if (
      ["total_due", "remaining_amount", "paid_amount", "amount"].includes(key)
    )
      return (
        <span className="money-value">
          {formatNumber(number(value))}
          <small> AFN</small>
        </span>
      );
    if (key.includes("date") || key === "created_at")
      return value ? formatDate(text(value), { dateStyle: "medium" }) : "—";
    if (Array.isArray(value)) return value.join(", ") || "—";
    return text(value) || "—";
  }
  if (editor)
    return (
      <RecordEditor
        key={editor.record?.id || "new"}
        api={api}
        catalog={catalog}
        record={editor.record}
        year={year}
        initialClass={classFilter || initialClass}
        references={references}
        onBack={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          refresh();
        }}
      />
    );
  if (reviewExam)
    return (
      <ResultsReview
        api={api}
        exam={reviewExam}
        onBack={() => setReviewExam(null)}
      />
    );
  if (exam)
    return (
      <MarksEntry
        api={api}
        exam={exam}
        classes={references.classes || []}
        admin={admin}
        onBack={() => setExam(null)}
        onSaved={refresh}
      />
    );
  return (
    <>
      <Heading title={w(catalog.title)} description={w(catalog.description)}>
        {canWrite && (
          <button
            className="button primary"
            onClick={() => setEditor({ record: null })}
          >
            <Icon name="plus" />
            {w("Add")} {w(catalog.singular)}
          </button>
        )}
        {section === "fees" && admin && (
          <button
            className="button secondary"
            onClick={() => setPayment({ fee: null })}
          >
            {w("Record payment")}
          </button>
        )}
        {section === "timetable" && (
          <button className="button secondary" onClick={() => window.print()}>
            {w("Print")}
          </button>
        )}
      </Heading>
      {section === "fees" && <FinanceOverview api={api} version={revision} />}
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      <section className="records-panel">
        <div className="record-toolbar">
          <Field label={w("Search")}>
            {(id) => (
              <input
                id={id}
                type="search"
                placeholder={`${w("Search")} ${w(catalog.title).toLowerCase()}`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </Field>
          {!["classes", "teachers", "announcements"].includes(section) && (
            <Field label={w("Class")}>
              {(id) => (
                <select
                  id={id}
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    onClassChange(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{w("All classes")}</option>
                  {references.classes?.map((row) => (
                    <option value={row.id} key={row.id}>
                      {text(row.name)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {
            <button
              className="button secondary"
              onClick={() => setMoreFilters(!moreFilters)}
              aria-expanded={moreFilters}
            >
              {w("More filters")}
            </button>
          }
        </div>
        {moreFilters && (
          <div className="advanced-filters">
            <Field label={w("Sort by")}>
              {(id) => (
                <select
                  id={id}
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{w("Default")}</option>
                  {catalog.fields
                    .filter((spec) =>
                      [
                        "name",
                        "title",
                        "student_id",
                        "teacher_id",
                        "academic_year",
                        "due_date",
                        "exam_date",
                      ].includes(spec.key),
                    )
                    .map((spec) => (
                      <option key={spec.key} value={spec.key}>
                        {w(spec.label)}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            {(section === "students" ||
              catalog.fields.some((spec) => spec.key === "status")) && (
              <Field label={w("Status")}>
                {(id) => (
                  <select
                    id={id}
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{w("All statuses")}</option>
                    {(section === "students"
                      ? ["Active", "Inactive"]
                      : catalog.fields.find((spec) => spec.key === "status")
                          ?.options || []
                    ).map((value) => (
                      <option key={value} value={value}>
                        {w(value)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <button
              className="text-button"
              onClick={() => {
                setStatusFilter("");
                setSort("");
                setClassFilter("");
                setSearch("");
                setPage(1);
              }}
            >
              {w("Reset filters")}
            </button>
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            {w(error)} <button onClick={refresh}>{w("Try again")}</button>
          </div>
        )}
        {busy ? (
          <Loading />
        ) : !records.length ? (
          <Empty
            title={w(
              count === 0 && (query || classFilter || statusFilter)
                ? "No matching records"
                : "No records yet",
            )}
            description={w("Use the action above to get started.")}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {catalog.columns.map((col) => (
                    <th key={col.key}>{w(col.label)}</th>
                  ))}
                  <th>{w("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    {catalog.columns.map((col, index) => (
                      <td
                        data-label={w(col.label)}
                        className={index === 0 ? "primary-cell" : ""}
                        key={col.key}
                      >
                        {display(row, col.key)}
                      </td>
                    ))}
                    <td data-label={w("Actions")}>
                      <div className="row-actions">
                        <button
                          className="button small secondary"
                          onClick={() => setDetail(row)}
                        >
                          {w("View")}
                        </button>
                        {section === "exams" && (
                          <button
                            className="button small secondary"
                            onClick={() => setReviewExam(row)}
                          >
                            {w("View results")}
                          </button>
                        )}
                        {section === "exams" && (
                          <button
                            className="button small primary"
                            onClick={() => setExam(row)}
                          >
                            {w("Enter marks")}
                          </button>
                        )}
                        {section === "fees" &&
                          admin &&
                          number(row.remaining_amount) > 0 && (
                            <button
                              className="button small primary"
                              onClick={() => setPayment({ fee: row })}
                            >
                              {w("Record payment")}
                            </button>
                          )}
                        {section === "classes" && (
                          <button
                            className="button small primary"
                            onClick={() =>
                              onNavigate(
                                "attendance",
                                undefined,
                                String(row.id),
                              )
                            }
                          >
                            {w("Take attendance")}
                          </button>
                        )}
                        {canWrite &&
                          (admin || row.created_by === session.user.id) && (
                            <button
                              className="button small secondary"
                              onClick={() => setEditor({ record: row })}
                            >
                              {w("Edit")}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {formatNumber(count)} {w("records")}
          </span>
          <div>
            <button
              className="button small secondary"
              disabled={page === 1 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              {w("Previous")}
            </button>
            <span>
              {w("Page")} {formatNumber(page)}
            </span>
            <button
              className="button small secondary"
              disabled={page * 30 >= count || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              {w("Next")}
            </button>
          </div>
        </div>
      </section>
      {detail && (
        <Dialog
          title={text(
            detail.name ||
              detail.title ||
              detail.student_name ||
              catalog.singular,
          )}
          onClose={() => setDetail(null)}
        >
          {section === "students" ? (
            <>
              <StudentDetails api={api} student={detail} admin={admin} />
              {admin && (
                <div className="detail-danger">
                  <button
                    className="button danger"
                    onClick={() => {
                      setArchive(detail);
                      setDetail(null);
                    }}
                  >
                    {w("Archive")} {w("Student")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <dl className="detail-grid">
                {catalog.fields.map((spec) => (
                  <div key={spec.key}>
                    <dt>{w(spec.label)}</dt>
                    <dd>{display(detail, spec.key)}</dd>
                  </div>
                ))}
              </dl>
              {section === "fees" && (
                <section>
                  <h3>{w("Payment history")}</h3>
                  {list(detail.payments).length ? (
                    list(detail.payments).map((row) => (
                      <div className="history-row" key={row.id}>
                        <span>{formatDate(text(row.payment_date))}</span>
                        <strong>{formatNumber(number(row.amount))} AFN</strong>
                        <button
                          className="button small secondary"
                          onClick={async () => {
                            try {
                              setDocument(
                                await api.request(
                                  `fee-payments/${row.id}/receipt/`,
                                ),
                              );
                            } catch (err) {
                              if (err instanceof APIError)
                                setError(err.message);
                            }
                          }}
                        >
                          {w("Receipt")}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>{w("No records yet")}</p>
                  )}
                </section>
              )}
              {section === "teachers" && admin && (
                <button
                  className="button primary"
                  onClick={() => {
                    setAccount(detail);
                    setDetail(null);
                  }}
                >
                  {w(detail.user ? "Account" : "Create account")}
                </button>
              )}
              {admin && !["exams", "announcements"].includes(section) && (
                <div className="detail-danger">
                  <button
                    className="button danger"
                    onClick={() => {
                      setArchive(detail);
                      setDetail(null);
                    }}
                  >
                    {w("Archive")} {w(catalog.singular)}
                  </button>
                </div>
              )}
            </>
          )}
        </Dialog>
      )}
      {archive && (
        <Dialog
          title={`${w("Archive")} ${w(catalog.singular)}`}
          onClose={() => setArchive(null)}
        >
          <p>
            {w(
              "This record will be removed from active work. Historical records will be preserved where applicable.",
            )}
          </p>
          <strong>
            {text(archive.name || archive.title || archive.student_name)}
          </strong>
          <div className="form-footer">
            <button
              className="button secondary"
              onClick={() => setArchive(null)}
            >
              {w("Cancel")}
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await api.request(`${catalog.endpoint}/${archive.id}/`, {
                    method: "DELETE",
                  });
                  setArchive(null);
                  refresh();
                } catch (err) {
                  if (err instanceof APIError) setError(err.message);
                  setArchive(null);
                }
              }}
            >
              {w("Archive")}
            </button>
          </div>
        </Dialog>
      )}
      {account && (
        <TeacherAccount
          api={api}
          teacher={account}
          onClose={() => setAccount(null)}
          onSaved={refresh}
        />
      )}
      {payment && (
        <PaymentForm
          api={api}
          fee={payment.fee}
          onClose={() => setPayment(null)}
          onSaved={async (row) => {
            setPayment(null);
            refresh();
            setDocument(await api.request(`fee-payments/${row.id}/receipt/`));
          }}
        />
      )}
      {document && (
        <Dialog title={w("Receipt")} onClose={() => setDocument(null)}>
          <PrintDocument data={object(document)} kind="receipt" />
        </Dialog>
      )}
    </>
  );
}
