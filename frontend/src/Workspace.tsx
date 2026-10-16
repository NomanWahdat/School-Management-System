import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { APIError, list, number, object, text, allRows } from "./api";
import type { APIClient, Row, Session } from "./api";
import {
  Brand,
  Dialog,
  Empty,
  Field,
  Heading,
  Icon,
  Loading,
} from "./components";
import { LanguageChoice, PasswordChange } from "./App";
import { useI18n, useWords } from "./i18n";
import { RecordsPage } from "./RecordPages";
import { PromotionForm } from "./Workflows";
import { AttendancePage } from "./Attendance";
import { TimetablePage } from "./Timetable";
import { Notifications } from "./Notifications";

const navigation = [
  {
    group: "People",
    pages: [
      ["students", "Students", "people"],
      ["teachers", "Teachers", "people"],
      ["classes", "Classes", "school"],
    ],
  },
  {
    group: "Learning",
    pages: [
      ["attendance", "Attendance", "check"],
      ["timetable", "Timetable", "calendar"],
      ["exams", "Exams & results", "book"],
      ["homework", "Homework", "book"],
    ],
  },
  {
    group: "Administration",
    pages: [
      ["fees", "Fees & payments", "money"],
      ["announcements", "Announcements", "notice"],
      ["reports", "Reports", "chart"],
      ["follow-up", "Follow-up", "people"],
      ["settings", "School settings", "settings"],
    ],
  },
];
const teacherPages = new Set([
  "classes",
  "attendance",
  "timetable",
  "exams",
  "homework",
  "announcements",
]);

export function Workspace({
  api,
  session,
  onSwitch,
  onPlatform,
  onLogout,
  switchError,
}: {
  api: APIClient;
  session: Session;
  onSwitch: (school: number) => Promise<void>;
  onPlatform: () => void;
  onLogout: () => Promise<void>;
  switchError: string;
}) {
  const w = useWords();
  const { setCalendar, formatDate } = useI18n();
  const [section, setSection] = useState("overview");
  const [intent, setIntent] = useState<string | undefined>();
  const [menu, setMenu] = useState(false);
  const [activeClass, setActiveClass] = useState("");
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [promotion, setPromotion] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const admin = session.user.role === "admin";
  useEffect(() => {
    let live = true;
    api
      .request<Record<string, unknown>>("school-context/")
      .then((data) => {
        if (live) {
          setContext(data);
          setCalendar(text(object(data.settings).calendar) || "gregory");
        }
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      });
    return () => {
      live = false;
      setCalendar("gregory");
    };
  }, [api, setCalendar, version]);
  const school = context ? object(context.school) : session.school!;
  const config = object(context?.settings);
  const year = text(config.academic_year);
  function navigate(page: string, nextIntent?: string, classId?: string) {
    if (classId !== undefined) setActiveClass(classId);
    setSection(page);
    setIntent(nextIntent);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const refreshContext = () => setVersion((old) => old + 1);
  return (
    <div
      className="workspace"
      style={
        {
          "--school-accent":
            text(object(school.appearance).accent) || "#364e6a",
        } as CSSProperties
      }
    >
      <aside className={`workspace-nav ${menu ? "open" : ""}`}>
        <div className="nav-brand">
          <Brand
            name={text(school.name)}
            logo={text(school.logo) || null}
            compact
          />
          <button
            className="button small secondary mobile-only"
            onClick={() => setMenu(false)}
          >
            {w("Close")}
          </button>
        </div>
        <span className="workspace-role">
          {w(admin ? "School Admin" : "Teacher")}
        </span>
        <nav aria-label={w("School workspace")}>
          <button
            className={`nav-link ${section === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
          >
            <Icon name="home" />
            {w(admin ? "Overview" : "My day")}
          </button>
          {navigation.map((group) => {
            const pages = group.pages.filter(
              ([key]) => admin || teacherPages.has(key),
            );
            return pages.length ? (
              <div className="nav-group" key={group.group}>
                <span>{w(group.group)}</span>
                {pages.map(([key, label, icon]) => (
                  <button
                    className={`nav-link ${section === key ? "active" : ""}`}
                    key={key}
                    onClick={() => navigate(key)}
                    aria-current={section === key ? "page" : undefined}
                  >
                    <Icon name={icon} />
                    {w(label)}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="nav-footer">
          {session.user.is_platform_admin && (
            <button className="nav-link" onClick={onPlatform}>
              <Icon name="school" />
              {w("Platform administration")}
            </button>
          )}
          <button className="nav-link" onClick={onLogout}>
            {w("Sign out")}
          </button>
          <span>{w("School workspace")}</span>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-overlay"
          aria-label={w("Close")}
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            className="button secondary mobile-only"
            onClick={() => setMenu(true)}
            aria-expanded={menu}
          >
            <span aria-hidden="true">☰</span> {w("Menu")}
          </button>
          <div className="school-switch">
            {session.memberships.length > 1 ? (
              <Field label={w("Choose your school")}>
                {(id) => (
                  <select
                    id={id}
                    value={session.school!.id}
                    onChange={(e) => onSwitch(Number(e.target.value))}
                  >
                    {session.memberships.map((m) => (
                      <option key={m.school.id} value={m.school.id}>
                        {m.school.id === session.school!.id
                          ? text(school.name)
                          : m.school.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <span className="active-school">
                <span className="live-dot" />
                {text(school.name)}
              </span>
            )}
            {year && (
              <small>
                {w("Academic year")} {year}
              </small>
            )}
          </div>
          <div className="topbar-tools">
            <Notifications api={api} onNavigate={navigate} />
            <LanguageChoice />
            <button
              className="profile-button"
              onClick={() => setProfileOpen(true)}
            >
              <span className="avatar">
                {(session.user.first_name || session.user.username)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span>
                {session.user.full_name || session.user.username}
                <small>{w(admin ? "School Admin" : "Teacher")}</small>
              </span>
            </button>
          </div>
        </header>
        <main className="page-content" id="main-content">
          {object(school.appearance).demo === true && (
            <div className="demo-banner">
              {w(
                "Demonstration school — all people, contacts and payments are synthetic.",
              )}
            </div>
          )}
          {(error || switchError) && (
            <div className="error-message" role="alert">
              {w(error || switchError)}{" "}
              <button onClick={refreshContext}>{w("Try again")}</button>
            </div>
          )}
          {!context && !error ? (
            <Loading />
          ) : section === "overview" ? (
            <Overview
              api={api}
              admin={admin}
              username={session.user.first_name || session.user.username}
              onNavigate={navigate}
            />
          ) : section === "attendance" ? (
            <AttendancePage
              api={api}
              initialClass={activeClass}
              onClassChange={setActiveClass}
            />
          ) : section === "timetable" ? (
            <TimetablePage
              api={api}
              session={session}
              school={school}
              year={year}
              initialClass={activeClass}
              onClassChange={setActiveClass}
            />
          ) : section === "reports" ? (
            <Reports api={api} school={school} />
          ) : section === "follow-up" ? (
            <FollowUp api={api} />
          ) : section === "settings" ? (
            <Settings
              api={api}
              config={config}
              appearance={object(school.appearance)}
              onSaved={refreshContext}
            />
          ) : (
            <>
              <RecordsPage
                key={section}
                api={api}
                session={session}
                section={section}
                year={year}
                initialClass={activeClass}
                onClassChange={setActiveClass}
                onNavigate={navigate}
                intent={intent}
                onIntentUsed={() => setIntent(undefined)}
              />
              {section === "classes" && admin && (
                <div className="section-extra">
                  <button
                    className="button secondary"
                    onClick={() => setPromotion(true)}
                  >
                    {w("Promote students")}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>{text(school.name)}</span>
          <span>{formatDate(new Date(), { dateStyle: "long" })} · Kabul</span>
        </footer>
      </div>
      {promotion && (
        <PromotionForm
          api={api}
          onClose={() => setPromotion(false)}
          onSaved={() => {
            setPromotion(false);
            navigate("students");
          }}
        />
      )}
      {profileOpen && (
        <Dialog title={w("Profile")} onClose={() => setProfileOpen(false)}>
          <Profile api={api} session={session} onLogout={onLogout} />
        </Dialog>
      )}
    </div>
  );
}

function Overview({
  api,
  admin,
  username,
  onNavigate,
}: {
  api: APIClient;
  admin: boolean;
  username: string;
  onNavigate: (page: string, intent?: string) => void;
}) {
  const w = useWords();
  const { formatNumber, formatDate } = useI18n();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .request<Record<string, unknown>>(
        admin ? "dashboard/" : "teacher-dashboard/",
      )
      .then((row) => {
        if (live) setData(row);
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, admin]);
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Kabul",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (!data)
    return error ? (
      <div className="error-message" role="alert">
        {w(error)}
      </div>
    ) : (
      <Loading />
    );
  const attendance = object(
    admin ? data.today_attendance : data.attendance_summary,
  );
  const stats = admin
    ? [
        ["Students", data.student_count, "people"],
        ["Teachers", data.teacher_count, "people"],
        ["Present", attendance.present, "check"],
        ["Outstanding fees", data.outstanding_balance, "money"],
      ]
    : [
        ["Your classes", list(data.assigned_classes_detail).length, "school"],
        ["Students", data.student_count, "people"],
        ["Present", attendance.present, "check"],
        ["Pending results", data.pending_result_count, "book"],
      ];
  const actions = admin
    ? [
        ["Add student", "students", "add", "people"],
        ["Take attendance", "attendance", "", "check"],
        ["Record payment", "fees", "pay", "money"],
        ["Enter results", "exams", "", "book"],
      ]
    : [
        ["Take attendance", "attendance", "", "check"],
        ["Enter results", "exams", "", "book"],
        ["Add homework", "homework", "add", "book"],
      ];
  return (
    <>
      <Heading
        title={`${w(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening")}, ${username}`}
        description={`${formatDate(new Date(), { weekday: "long", dateStyle: undefined, month: "long", day: "numeric" })} · ${w("Here is your school day at a glance.")}`}
      />
      <section className="overview-stats">
        {stats.map(([label, value, icon]) => (
          <div className="overview-stat" key={text(label)}>
            <span className="stat-icon">
              <Icon name={text(icon)} />
            </span>
            <div>
              <span>{w(text(label))}</span>
              <strong>
                {formatNumber(number(value))}
                {label === "Outstanding fees" && <small> AFN</small>}
              </strong>
            </div>
          </div>
        ))}
      </section>
      <section className="daily-actions">
        <div className="section-title">
          <h2>{w("What would you like to do?")}</h2>
          <span>{w("Common tasks")}</span>
        </div>
        <div className="action-grid">
          {actions.map(([label, page, intent, icon]) => (
            <button
              className="task-action"
              key={label}
              onClick={() => onNavigate(page, intent || undefined)}
            >
              <span className="task-icon">
                <Icon name={icon} />
              </span>
              <strong>{w(label)}</strong>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="section-title">
            <h2>{w(admin ? "Attendance today" : "Teaching today")}</h2>
            <button
              className="text-button"
              onClick={() => onNavigate(admin ? "attendance" : "timetable")}
            >
              {w("View")}
            </button>
          </div>
          {admin ? (
            <>
              <div className="attendance-totals">
                {["Present", "Absent", "Late"].map((x) => (
                  <div key={x}>
                    <strong>
                      {formatNumber(number(attendance[x.toLowerCase()]))}
                    </strong>
                    <span>{w(x)}</span>
                  </div>
                ))}
              </div>
              <div className="class-progress-list">
                {list(attendance.by_class).map((row) => (
                  <div key={number(row.class_id)}>
                    <span>{text(row.class_name)}</span>
                    <progress
                      value={number(row.total)}
                      max={number(row.expected) || 1}
                      aria-label={`${text(row.class_name)} ${w("Attendance")}`}
                    />
                    <small>
                      {formatNumber(number(row.total))}/
                      {formatNumber(number(row.expected))}
                    </small>
                  </div>
                ))}
              </div>
            </>
          ) : list(data.today_timetable).length ? (
            list(data.today_timetable).map((row) => (
              <div className="schedule-row" key={row.id}>
                <time>{text(row.start_time).slice(0, 5)}</time>
                <div>
                  <strong>{text(row.subject)}</strong>
                  <small>{text(row.school_class)}</small>
                </div>
              </div>
            ))
          ) : (
            <Empty title={w("No lessons scheduled today")} />
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>{w(admin ? "Announcements" : "Pending results")}</h2>
            <button
              className="text-button"
              onClick={() => onNavigate(admin ? "announcements" : "exams")}
            >
              {w("View")}
            </button>
          </div>
          {admin ? (
            list(data.latest_announcements).length ? (
              list(data.latest_announcements).map((row) => (
                <article className="notice-preview" key={row.id}>
                  <strong>{text(row.title)}</strong>
                  <p>{text(row.content)}</p>
                  <small>{formatDate(text(row.created_at))}</small>
                </article>
              ))
            ) : (
              <Empty title={w("No announcements yet")} />
            )
          ) : list(data.pending_results).length ? (
            list(data.pending_results)
              .slice(0, 5)
              .map((row) => (
                <div
                  className="history-row"
                  key={`${row.exam_id}:${row.subject}`}
                >
                  <div>
                    <strong>{text(row.exam_name)}</strong>
                    <small>
                      {text(row.class_name)} · {text(row.subject)}
                    </small>
                  </div>
                  <span>
                    {number(row.completed)}/{number(row.total)}
                  </span>
                </div>
              ))
          ) : (
            <Empty title={w("All results are up to date")} />
          )}
        </section>
      </div>
    </>
  );
}

function Reports({
  api,
  school,
}: {
  api: APIClient;
  school: Record<string, unknown> | Session["school"];
}) {
  const w = useWords();
  const { formatNumber } = useI18n();
  const [mode, setMode] = useState("students");
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [classes, setClasses] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      allRows(api, "classes/"),
      allRows(api, "students/"),
      allRows(api, "exams/"),
    ])
      .then(([c, s, e]) => {
        if (live) {
          setClasses(c);
          setStudents(s);
          setExams(e);
        }
      })
      .catch((err) => {
        if (live) setError(String(err));
      });
    return () => {
      live = false;
    };
  }, [api]);
  const query = () =>
    new URLSearchParams({
      report: mode,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, value]) => Boolean(value)),
      ),
      ...(classId ? { class: classId } : {}),
      ...(from && mode === "attendance" ? { from } : {}),
      ...(to && mode === "attendance" ? { to } : {}),
    }).toString();
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setRows(await api.request(`reports/?${query()}`));
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    try {
      const blob = await api.request<Blob>(
        `reports/?${query()}&format=csv`,
        {},
        true,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${text(school?.slug)}-${mode}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    }
  }
  const labels: Record<string, string> = {
    student_id: "Student ID",
    student_name: "Student",
    name: "Student",
    father_name: "Father / guardian name",
    class_name: "Class",
    contact_number: "Phone",
    gender: "Gender",
    status: "Status",
    date: "Date",
    fee_type: "Fee type",
    total_due: "Total due",
    paid: "Paid",
    remaining: "Remaining",
    due_date: "Due date",
    exam_name: "Examination",
    subject: "Subject",
    marks: "Marks",
    maximum: "Maximum marks",
    percentage: "Percentage",
    grade: "Grade",
    classes: "Classes",
  };
  return (
    <>
      <Heading
        title={w("Reports")}
        description={w("Generate a school report, then print or download it.")}
      />
      <form className="panel report-controls" onSubmit={generate}>
        <div className="form-grid">
          <Field label={w("Report type")}>
            {(id) => (
              <select
                id={id}
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setFilters({});
                  setRows(null);
                }}
              >
                {[
                  ["students", "Students"],
                  ["attendance", "Attendance"],
                  ["results", "Results"],
                  ["fees", "Fees & payments"],
                  ["teachers", "Teachers"],
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {w(label)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={w("Class")}>
            {(id) => (
              <select
                id={id}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">{w("All classes")}</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {text(row.name)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {mode === "attendance" && (
            <>
              <Field label={w("From")}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                )}
              </Field>
              <Field label={w("To")}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          {w("More filters")}
        </button>
        {advanced && (
          <div className="form-grid">
            {["attendance", "results", "fees"].includes(mode) && (
              <Field label={w("Student")}>
                {(id) => (
                  <select
                    id={id}
                    value={filters.student || ""}
                    onChange={(e) =>
                      setFilters((old) => ({ ...old, student: e.target.value }))
                    }
                  >
                    <option value="">{w("All students")}</option>
                    {students
                      .filter(
                        (row) =>
                          !classId || String(row.school_class) === classId,
                      )
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {text(row.name)} ({text(row.student_id)})
                        </option>
                      ))}
                  </select>
                )}
              </Field>
            )}
            {mode === "students" && (
              <Field label={w("Gender")}>
                {(id) => (
                  <select
                    id={id}
                    value={filters.gender || ""}
                    onChange={(e) =>
                      setFilters((old) => ({ ...old, gender: e.target.value }))
                    }
                  >
                    <option value="">{w("All genders")}</option>
                    <option value="Male">{w("Male")}</option>
                    <option value="Female">{w("Female")}</option>
                  </select>
                )}
              </Field>
            )}
            {mode !== "results" && (
              <Field label={w("Status")}>
                {(id) => (
                  <select
                    id={id}
                    value={filters.status || ""}
                    onChange={(e) =>
                      setFilters((old) => ({ ...old, status: e.target.value }))
                    }
                  >
                    <option value="">{w("All statuses")}</option>
                    {(mode === "attendance"
                      ? ["Present", "Absent", "Late"]
                      : mode === "fees"
                        ? ["Paid", "Partially Paid", "Pending"]
                        : ["Active", "Inactive"]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {w(value)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            {mode === "results" && (
              <>
                <Field label={w("Examination")}>
                  {(id) => (
                    <select
                      id={id}
                      value={filters.exam || ""}
                      onChange={(e) =>
                        setFilters((old) => ({
                          ...old,
                          exam: e.target.value,
                          subject: "",
                        }))
                      }
                    >
                      <option value="">{w("All examinations")}</option>
                      {exams
                        .filter(
                          (row) =>
                            !classId || String(row.school_class) === classId,
                        )
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {text(row.name)}
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
                <Field label={w("Subject")}>
                  {(id) => (
                    <select
                      id={id}
                      value={filters.subject || ""}
                      onChange={(e) =>
                        setFilters((old) => ({
                          ...old,
                          subject: e.target.value,
                        }))
                      }
                    >
                      <option value="">{w("All subjects")}</option>
                      {[
                        ...new Set(
                          exams
                            .filter(
                              (row) =>
                                !filters.exam ||
                                String(row.id) === filters.exam,
                            )
                            .flatMap((row) =>
                              Array.isArray(row.subjects)
                                ? row.subjects.map(String)
                                : [text(row.subject)],
                            ),
                        ),
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  )}
                </Field>
              </>
            )}
          </div>
        )}
        <button className="button primary" disabled={busy}>
          {w(busy ? "Loading school records\u2026" : "Generate report")}
        </button>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {w(error)}
        </p>
      )}
      {rows && (
        <section className="records-panel">
          <div className="section-title report-title">
            <Brand name={text(school?.name)} logo={text(school?.logo)} />
            <div className="row-actions">
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                {w("Print")}
              </button>
              <button className="button primary" onClick={download}>
                {w("Download CSV")}
              </button>
            </div>
          </div>
          <div className="table-scroll">
            {rows.length ? (
              <table>
                <thead>
                  <tr>
                    {Object.keys(rows[0]).map((key) => (
                      <th key={key}>{w(labels[key] || key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([key, value]) => (
                        <td key={key}>
                          {Array.isArray(value)
                            ? value.join(", ")
                            : [
                                  "paid",
                                  "remaining",
                                  "total_due",
                                  "marks",
                                  "maximum",
                                  "percentage",
                                ].includes(key)
                              ? formatNumber(number(value))
                              : text(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title={w("No matching records")} />
            )}
          </div>
        </section>
      )}
    </>
  );
}

function FollowUp({ api }: { api: APIClient }) {
  const w = useWords();
  const { formatNumber } = useI18n();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .request<Record<string, unknown>>("follow-up/")
      .then((data) => {
        if (live) setData(data);
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api]);
  return (
    <>
      <Heading
        title={w("Follow-up")}
        description={w("Students who may need a call or a reminder today.")}
      />
      {error && <p className="error-message">{w(error)}</p>}
      {!data ? (
        <Loading />
      ) : (
        <div className="overview-grid">
          {[
            ["absent_today", "Absent today"],
            ["overdue_fees", "Outstanding fees"],
          ].map(([key, label]) => (
            <section className="panel" key={key}>
              <h2>{w(label)}</h2>
              {list(data[key]).length ? (
                list(data[key]).map((row, index) => (
                  <div className="history-row" key={row.id || index}>
                    <div>
                      <strong>{text(row.name || row.student_name)}</strong>
                      <small>
                        {key === "overdue_fees"
                          ? `${formatNumber(number(row.remaining_amount))} AFN`
                          : w("Absent")}
                      </small>
                    </div>
                    {Boolean(row.phone) && (
                      <a
                        className="button small secondary"
                        href={`tel:${text(row.phone)}`}
                      >
                        {text(row.phone)}
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <Empty title={w("No follow-up needed")} />
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Settings({
  api,
  config,
  appearance,
  onSaved,
}: {
  api: APIClient;
  config: Record<string, unknown>;
  appearance: Record<string, unknown>;
  onSaved: () => void;
}) {
  const w = useWords();
  const [values, setValues] = useState(config);
  const [accent, setAccent] = useState(text(appearance.accent) || "#364e6a");
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState<Record<string, number>>(
    (config.grading_scale || { A: 90, B: 80, C: 70, D: 60, E: 0 }) as Record<
      string,
      number
    >,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [audit, setAudit] = useState<Row[] | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      for (const key of [
        "school_name",
        "academic_year",
        "phone",
        "address",
        "calendar",
      ])
        form.append(key, text(values[key]));
      form.append("teaching_days", JSON.stringify(values.teaching_days || []));
      form.append(
        "allow_teacher_attendance_retake",
        String(values.allow_teacher_attendance_retake !== false),
      );
      form.append("grading_scale", JSON.stringify(scale));
      form.append("appearance", JSON.stringify({ accent }));
      if (file) form.append("logo", file);
      await api.request("settings/", { method: "PATCH", body: form });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(
        err instanceof APIError ? err.message : "Check the grading thresholds.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={w("School settings")}
        description={w(
          "Your school identity, teaching calendar, and grading rules.",
        )}
      />
      <form className="focused-form editor-form" onSubmit={submit}>
        <Field label={w("Teacher attendance corrections")}>
          <select
            value={
              values.allow_teacher_attendance_retake === false ? "no" : "yes"
            }
            onChange={(e) =>
              setValues({
                ...values,
                allow_teacher_attendance_retake: e.target.value === "yes",
              })
            }
          >
            <option value="yes">
              {w("Allow assigned teachers to retake attendance")}
            </option>
            <option value="no">
              {w("Only administrators can correct saved attendance")}
            </option>
          </select>
        </Field>
        <h2>{w("School identity")}</h2>
        <div className="form-grid">
          {[
            ["school_name", "School name"],
            ["academic_year", "Academic year"],
            ["phone", "Phone"],
            ["address", "Address"],
          ].map(([key, label]) => (
            <Field
              label={w(label)}
              key={key}
              required={key === "school_name" || key === "academic_year"}
            >
              {(id) => (
                <input
                  id={id}
                  value={text(values[key])}
                  onChange={(e) => {
                    setValues({ ...values, [key]: e.target.value });
                    setSaved(false);
                  }}
                  required={key === "school_name" || key === "academic_year"}
                />
              )}
            </Field>
          ))}
        </div>
        <Field label={w("School logo")}>
          {(id) => (
            <div className="logo-upload">
              {config.logo ? (
                <img src={text(config.logo)} alt={w("School logo")} />
              ) : null}
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setSaved(false);
                }}
              />
              <small>PNG, JPEG, WebP · 2 MB</small>
            </div>
          )}
        </Field>
        <Field label={w("Accent color")}>
          {(id) => (
            <input
              id={id}
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          )}
        </Field>
        <h2>{w("Teaching calendar")}</h2>
        <Field label={w("Calendar")}>
          {(id) => (
            <select
              id={id}
              value={text(values.calendar) || "gregory"}
              onChange={(e) =>
                setValues({ ...values, calendar: e.target.value })
              }
            >
              <option value="gregory">{w("Gregorian")}</option>
              <option value="persian">{w("Solar Hijri")}</option>
            </select>
          )}
        </Field>
        <p className="muted">
          {w(
            "Displayed dates use this calendar. Date entry uses Gregorian dates.",
          )}
        </p>
        <fieldset className="checkbox-field">
          <legend>{w("Teaching days")}</legend>
          <div className="checkbox-options">
            {[
              "Saturday",
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
            ].map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(values.teaching_days) &&
                    values.teaching_days.includes(day)
                  }
                  onChange={(e) => {
                    const current = Array.isArray(values.teaching_days)
                      ? values.teaching_days
                      : [];
                    setValues({
                      ...values,
                      teaching_days: e.target.checked
                        ? [...current, day]
                        : current.filter((x) => x !== day),
                    });
                  }}
                />
                {w(day)}
              </label>
            ))}
          </div>
        </fieldset>
        <details className="additional-details">
          <summary>{w("Grading thresholds")}</summary>
          <p className="muted">
            {w("Set the minimum percentage for each grade, including zero.")}
          </p>
          <div className="form-grid">
            {Object.entries(scale).map(([grade, threshold]) => (
              <Field key={grade} label={`${w("Grade")} ${grade}`} required>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min="0"
                    max="100"
                    value={threshold}
                    onChange={(e) =>
                      setScale((old) => ({
                        ...old,
                        [grade]: Number(e.target.value),
                      }))
                    }
                    required
                  />
                )}
              </Field>
            ))}
          </div>
        </details>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        {saved && (
          <p className="success-message" role="status">
            {w("Saved successfully")}
          </p>
        )}
        <div className="form-footer">
          <button className="button primary" disabled={busy}>
            {w(busy ? "Saving…" : "Save")}
          </button>
        </div>
      </form>
      <section className="panel settings-history">
        <div className="section-title">
          <h2>{w("Administrative history")}</h2>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setAudit(await api.request("audit/"));
              } catch (err) {
                if (err instanceof APIError) setError(err.message);
              }
            }}
          >
            {w("View")}
          </button>
        </div>
        {audit && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{w("Account")}</th>
                  <th>{w("Actions")}</th>
                  <th>{w("Date")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td>{text(row.actor__username)}</td>
                    <td>{text(row.action).replaceAll("_", " ")}</td>
                    <td>{text(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Profile({
  api,
  session,
  onLogout,
}: {
  api: APIClient;
  session: Session;
  onLogout: () => Promise<void>;
}) {
  const w = useWords();
  const [first, setFirst] = useState(session.user.first_name);
  const [last, setLast] = useState(session.user.last_name);
  const [password, setPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const user = await api.request<Session["user"]>("profile/", {
        method: "PATCH",
        body: JSON.stringify({ first_name: first, last_name: last }),
      });
      api.replaceSession({
        ...session,
        user: { ...user, role: session.user.role },
      });
      setNotice("Saved successfully");
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="focused-form" onSubmit={submit}>
        <p className="muted">{session.user.username}</p>
        <div className="form-grid">
          <Field label={w("First name")}>
            {(id) => (
              <input
                id={id}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            )}
          </Field>
          <Field label={w("Last name")}>
            {(id) => (
              <input
                id={id}
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error && <p className="error-message">{w(error)}</p>}
        {notice && <p className="success-message">{w(notice)}</p>}
        <button className="button primary" disabled={busy}>
          {w(busy ? "Saving…" : "Save")}
        </button>
      </form>
      <div className="profile-security">
        <button
          className="button secondary"
          onClick={() => setPassword(!password)}
        >
          {w("Change password")}
        </button>
        <button className="button danger" onClick={() => setEnding(true)}>
          {w("End all sessions")}
        </button>
        <button className="button secondary" onClick={onLogout}>
          {w("Sign out")}
        </button>
      </div>
      {password && (
        <PasswordChange
          api={api}
          onDone={() => {
            setPassword(false);
            setNotice("Saved successfully");
          }}
        />
      )}
      {ending && (
        <div className="notice">
          <p>{w("All devices will be signed out. Continue?")}</p>
          <button
            className="button danger"
            onClick={async () => {
              await api.request("logout-all/", { method: "POST", body: "{}" });
              api.replaceSession(null);
            }}
          >
            {w("End all sessions")}
          </button>
          <button className="button secondary" onClick={() => setEnding(false)}>
            {w("Cancel")}
          </button>
        </div>
      )}
    </>
  );
}
