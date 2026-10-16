import { today } from "./api";
export type FieldSpec = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  source?: string;
  multiple?: boolean;
  optional?: boolean;
};
export type Catalog = {
  title: string;
  description: string;
  singular: string;
  icon: string;
  endpoint: string;
  columns: { key: string; label: string }[];
  fields: FieldSpec[];
  defaults?: Record<string, unknown>;
};
const field = (
  key: string,
  label: string,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ key, label, required: true, ...extra });
const column = (key: string, label: string) => ({ key, label });
export const catalogs: Record<string, Catalog> = {
  students: {
    title: "Students",
    description: "Find a student or add a new admission.",
    singular: "Student",
    icon: "people",
    endpoint: "students",
    columns: [
      column("name", "Student"),
      column("student_id", "Student ID"),
      column("school_class_name", "Class"),
      column("contact_number", "Phone"),
      column("is_active", "Status"),
    ],
    fields: [
      field("name", "Student name"),
      field("student_id", "Student ID"),
      field("father_name", "Father / guardian name"),
      field("school_class", "Class", { source: "classes" }),
      field("gender", "Gender", { options: ["Male", "Female"] }),
      field("date_of_birth", "Date of birth", { type: "date" }),
      field("contact_number", "Contact number", { type: "tel" }),
      field("address", "Address", { type: "textarea", optional: true }),
      field("is_active", "Status", { type: "boolean", optional: true }),
    ],
    defaults: { gender: "Male", is_active: true },
  },
  teachers: {
    title: "Teachers",
    description: "Manage teaching staff, assigned classes, and school access.",
    singular: "Teacher",
    icon: "people",
    endpoint: "teachers",
    columns: [
      column("name", "Teacher"),
      column("subject", "Subject"),
      column("assigned_class_names", "Classes"),
      column("account_status", "Account"),
      column("status", "Status"),
    ],
    fields: [
      field("name", "Teacher name"),
      field("teacher_id", "Teacher ID"),
      field("phone_number", "Phone number", { type: "tel" }),
      field("subject", "Subject"),
      field("assigned_classes", "Assigned classes", {
        source: "classes",
        multiple: true,
      }),
      field("status", "Status", {
        options: ["Active", "Inactive"],
        optional: true,
      }),
    ],
    defaults: { status: "Active", assigned_classes: [] },
  },
  classes: {
    title: "Classes",
    description:
      "Keep classes, teaching subjects, and academic years organized.",
    singular: "Class",
    icon: "school",
    endpoint: "classes",
    columns: [
      column("name", "Class"),
      column("grade", "Grade"),
      column("academic_year", "Academic year"),
      column("student_count", "Students"),
      column("status", "Status"),
    ],
    fields: [
      field("name", "Class name"),
      field("grade", "Grade", { type: "number" }),
      field("section", "Section", { required: false }),
      field("academic_year", "Academic year"),
      field("subjects", "Subjects", { type: "tags" }),
      field("status", "Status", {
        options: ["Active", "Inactive"],
        optional: true,
      }),
    ],
    defaults: { status: "Active", subjects: [] },
  },
  timetable: {
    title: "Timetable",
    description: "A clear weekly schedule for classes and teachers.",
    singular: "Lesson",
    icon: "calendar",
    endpoint: "timetable",
    columns: [
      column("day", "Day"),
      column("start_time", "Start"),
      column("end_time", "End"),
      column("school_class", "Class"),
      column("subject", "Subject"),
      column("teacher", "Teacher"),
    ],
    fields: [
      field("school_class", "Class", { source: "classes" }),
      field("teacher", "Teacher", { source: "teachers" }),
      field("subject", "Subject"),
      field("day", "Day", {
        options: [
          "Saturday",
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
        ],
      }),
      field("start_time", "Start time", { type: "time" }),
      field("end_time", "End time", { type: "time" }),
    ],
    defaults: { day: "Saturday", start_time: "08:00", end_time: "09:00" },
  },
  exams: {
    title: "Exams & results",
    description: "Choose an exam to enter marks or review student results.",
    singular: "Examination",
    icon: "book",
    endpoint: "exams",
    columns: [
      column("name", "Examination"),
      column("school_class", "Class"),
      column("exam_type", "Type"),
      column("exam_date", "Date"),
      column("max_marks", "Maximum marks"),
    ],
    fields: [
      field("name", "Examination name"),
      field("school_class", "Class", { source: "classes" }),
      field("subjects", "Subjects", { type: "subjects", multiple: true }),
      field("exam_type", "Examination type", {
        options: [
          "Monthly Test",
          "Four-and-a-Half-Month Examination",
          "Annual Examination",
          "Midterm Examination",
          "Final Examination",
          "Other",
        ],
      }),
      field("academic_year", "Academic year"),
      field("exam_date", "Exam date", { type: "date" }),
      field("max_marks", "Maximum marks", { type: "number" }),
      field("start_date", "Start date", {
        type: "date",
        required: false,
        optional: true,
      }),
      field("end_date", "End date", {
        type: "date",
        required: false,
        optional: true,
      }),
    ],
    defaults: {
      subjects: [],
      exam_type: "Monthly Test",
      exam_date: today(),
      max_marks: 100,
    },
  },
  fees: {
    title: "Fees & payments",
    description: "See outstanding balances and record a payment.",
    singular: "Fee",
    icon: "money",
    endpoint: "fees",
    columns: [
      column("student_name", "Student"),
      column("fee_type", "Fee type"),
      column("total_due", "Total due"),
      column("remaining_amount", "Remaining"),
      column("status", "Status"),
    ],
    fields: [
      field("student", "Student", { source: "students" }),
      field("fee_type", "Fee type", {
        options: [
          "Monthly Tuition Fee",
          "Admission Fee",
          "Registration Fee",
          "Examination Fee",
          "Other School Fee",
        ],
      }),
      field("amount", "Amount (AFN)", { type: "number" }),
      field("academic_year", "Academic year"),
      field("due_date", "Due date", { type: "date" }),
      field("billing_period", "Billing month", {
        type: "month",
        required: false,
      }),
      field("notes", "Notes", {
        type: "textarea",
        required: false,
        optional: true,
      }),
    ],
    defaults: { fee_type: "Monthly Tuition Fee", due_date: today() },
  },
  homework: {
    title: "Homework",
    description: "Give students a clear assignment and due date.",
    singular: "Homework",
    icon: "book",
    endpoint: "homework",
    columns: [
      column("title", "Assignment"),
      column("school_class", "Class"),
      column("subject", "Subject"),
      column("due_date", "Due date"),
    ],
    fields: [
      field("title", "Title"),
      field("school_class", "Class", { source: "classes" }),
      field("subject", "Subject"),
      field("due_date", "Due date", { type: "date" }),
      field("description", "Instructions", { type: "textarea" }),
    ],
    defaults: { due_date: today() },
  },
  announcements: {
    title: "Announcements",
    description: "Share school news with the right people.",
    singular: "Announcement",
    icon: "notice",
    endpoint: "announcements",
    columns: [
      column("title", "Title"),
      column("audience", "Audience"),
      column("effective_status", "Status"),
      column("created_at", "Created"),
    ],
    fields: [
      field("title", "Title"),
      field("content", "Message", { type: "textarea" }),
      field("audience", "Audience", {
        options: ["Everyone", "Teachers", "Students", "Class"],
      }),
      field("school_class", "Class", { source: "classes", required: false }),
      field("status", "Status", {
        options: ["Published", "Draft", "Archived"],
      }),
      field("publish_at", "Publish at", {
        type: "datetime-local",
        required: false,
        optional: true,
      }),
      field("expires_at", "Expires at", {
        type: "datetime-local",
        required: false,
        optional: true,
      }),
    ],
    defaults: { audience: "Everyone", status: "Published" },
  },
};
