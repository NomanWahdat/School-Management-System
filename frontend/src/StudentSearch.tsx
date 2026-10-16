import { useEffect, useState } from "react";
import { text } from "./api";
import type { APIClient, Page, Row } from "./api";
import { Field, Status } from "./components";
import { useWords } from "./i18n";

export function StudentSearch({
  api,
  value,
  onChange,
  initial,
}: {
  api: APIClient;
  value: number;
  onChange: (id: number) => void;
  initial?: Row;
}) {
  const w = useWords();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>(initial ? [initial] : []);
  const [selected, setSelected] = useState<Row | undefined>(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .request<Page<Row>>(
          `students/?page=1&page_size=12&status=Active&search=${encodeURIComponent(search)}`,
        )
        .then((data) => {
          if (live) {
            setRows(data.results);
            setError("");
          }
        })
        .catch((err) => {
          if (live && err.name !== "AbortError") setError(err.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, search]);
  return (
    <div className="student-search">
      <Field label={w("Search student")}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={w("Student name or ID")}
        />
      </Field>
      {selected && value === selected.id && (
        <div className="selected-student">
          <strong>{text(selected.name)}</strong>
          <span>
            {text(selected.student_id)} · {text(selected.school_class_name)}
          </span>
          <Status value="Selected" />
        </div>
      )}
      <div
        className="student-search-results"
        aria-label={w("Student search results")}
      >
        {rows.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`student-choice ${value === row.id ? "chosen" : ""}`}
            onClick={() => {
              setSelected(row);
              onChange(row.id);
            }}
          >
            <strong>{text(row.name)}</strong>
            <span>
              {text(row.student_id)} · {text(row.school_class_name)} ·{" "}
              {text(row.father_name)}
            </span>
          </button>
        ))}
        {!rows.length && <p>{w("No matching students")}</p>}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
