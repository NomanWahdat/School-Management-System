import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { LocalizedContent, localeOptions, useI18n } from './i18n';

const API_BASE = `${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')}/api`;
const authStorage = window.sessionStorage;

type UserType = {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  role: string;
  must_change_password?: boolean;
  is_active?: boolean;
  last_login?: string | null;
};

type BrandingType = { school_name: string; logo?: string | null };

type StudentType = {
  id?: number;
  student_id: string;
  name: string;
  father_name: string;
  gender: string;
  date_of_birth: string;
  school_class?: string | number;
  school_class_name?: string;
  contact_number: string;
  address: string;
  admission_date?: string;
  fee_status: string;
  is_active?: boolean;
};

type TeacherType = {
  id?: number;
  user?: number;
  teacher_id?: string;
  name: string;
  phone_number?: string;
  subject: string;
  status: string;
  assigned_classes?: number[];
  assigned_class_names?: string[];
  account_username?: string;
  account_email?: string;
  account_status?: string;
};

type TeacherFormType = {
  teacher_id: string;
  name: string;
  phone_number: string;
  subject: string;
  status: string;
  assigned_classes: number[];
  account_username: string;
  account_email: string;
  temporary_password: string;
  account_status: string;
  must_change_password: boolean;
};

type SettingsType = {
  school_name: string;
  phone: string;
  address: string;
  academic_year: string;
  logo?: string | null;
};

type ClassType = {
  id?: number;
  name: string;
  grade?: string;
  academic_year?: string;
  subjects?: string[];
  available_subjects?: string[];
  status?: string;
  student_count?: number;
  teacher_count?: number;
};

type TimetableType = {
  id?: number;
  day: string;
  start_time: string;
  end_time: string;
  school_class: number | string;
  subject: string;
  teacher: number | string;
};

type AttendanceType = {
  id?: number;
  student: number;
  student_name?: string;
  school_class?: number;
  school_class_name?: string;
  attendance_date: string;
  status: string;
  remarks?: string;
  recorded_by?: number;
  recorded_by_name?: string;
};

type ExamType = {
  id?: number;
  name: string;
  school_class: number | string;
  subject: string;
  subjects?: string[];
  exam_type?: string;
  academic_year?: string;
  exam_date: string;
  start_date?: string;
  end_date?: string;
  max_marks?: number;
  created_at?: string;
};

type ResultType = {
  id?: number;
  student: number;
  student_name?: string;
  exam: number;
  exam_name?: string;
  subject?: string;
  marks: number;
  total_marks: number;
  percentage: number;
  grade: string;
  status?: string;
};

type FeePaymentType = {
  id?: number;
  fee: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes?: string;
  recorded_by?: number;
};

type FeeType = {
  id?: number;
  student: number;
  student_name?: string;
  class_name?: string;
  school_class?: number | string;
  fee_type?: string;
  academic_year?: string;
  amount: number;
  total_due?: number;
  paid_amount?: number;
  remaining_amount?: number;
  due_date?: string;
  payment_date?: string;
  status: string;
  payment_method?: string;
  notes?: string;
  payments?: FeePaymentType[];
  created_at?: string;
};

type HomeworkType = {
  id?: number;
  title: string;
  description: string;
  school_class: number | string;
  subject: string;
  due_date: string;
};
type AnnouncementType = {
  id?: number;
  title: string;
  content: string;
  audience?: string;
  school_class?: number | string | null;
  school_class_name?: string;
  status?: string;
  effective_status?: string;
  publish_at?: string | null;
  expires_at?: string | null;
  created_by_name?: string;
  created_at?: string;
};

type DashboardAttendanceSummary = {
  present?: number;
  absent?: number;
  late?: number;
  total?: number;
  by_class?: Array<{
    class_id?: number;
    class_name: string;
    present: number;
    absent: number;
    late: number;
    total: number;
  }>;
};

type DashboardType = {
  student_count?: number;
  teacher_count?: number;
  today_attendance?: number | DashboardAttendanceSummary;
  pending_fees?: number;
  latest_announcements?: AnnouncementType[];
};

type ReportType = {
  student_count?: number;
  teacher_count?: number;
  attendance_rate?: number;
  fee_summary?: {
    paid?: number;
    pending?: number;
    partially_paid?: number;
  };
  class_summary?: Array<{ name: string; student_count: number }>;
  result_count?: number;
};

type ReportRow = Record<string, string | number | null | undefined | string[]>;

type TeacherDashboardType = {
  teacher_name?: string;
  subject?: string;
  assigned_classes?: string[];
  assigned_classes_detail?: Array<{ id: number; name: string; grade?: string; academic_year?: string; student_count: number; subjects: string[]; attendance_marked: number; attendance_total: number }>;
  assigned_class_ids?: number[];
  assigned_subjects?: string[];
  student_count?: number;
  attendance_summary?: {
    marked_today?: number;
    present?: number;
    absent?: number;
    late?: number;
    total_students?: number;
    attendance_percentage?: number;
  };
  pending_result_count?: number;
  pending_results?: Array<{ exam_id?: number; exam_name: string; class_name: string; subject: string; completed: number; total: number }>;
  upcoming_exams?: Array<{ id?: number; name: string; class_name: string; exam_date: string; subjects: string[] }>;
  today_timetable?: Array<{ id?: number; subject: string; day?: string; start_time: string; end_time: string; school_class: string; school_class_id?: number; teacher?: string }>;
  upcoming_homework?: Array<{ title: string; subject: string; due_date: string; school_class: string }>;
  relevant_announcements?: AnnouncementType[];
};

const initialStudent: StudentType = {
  student_id: '',
  name: '',
  father_name: '',
  gender: 'Male',
  date_of_birth: '',
  school_class: '',
  contact_number: '',
  address: '',
  fee_status: 'Pending',
};

const initialTeacherForm: TeacherFormType = {
  teacher_id: '',
  name: '',
  phone_number: '',
  subject: '',
  status: 'Active',
  assigned_classes: [],
  account_username: '',
  account_email: '',
  temporary_password: '',
  account_status: 'Active',
  must_change_password: true,
};

const initialAttendance: AttendanceType = {
  student: 0,
  attendance_date: new Date().toISOString().slice(0, 10),
  status: 'Present',
  remarks: '',
};

const initialExam: ExamType = {
  name: '',
  school_class: '',
  subject: '',
  exam_type: 'Monthly Test',
  academic_year: String(new Date().getFullYear()),
  exam_date: new Date().toISOString().slice(0, 10),
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  max_marks: 100,
};

const initialTimetable: TimetableType = {
  day: 'Monday',
  start_time: '08:00',
  end_time: '09:00',
  school_class: '',
  subject: '',
  teacher: '',
};

const initialResult: ResultType = {
  student: 0,
  exam: 0,
  subject: '',
  marks: 0,
  total_marks: 100,
  percentage: 0,
  grade: 'A',
  status: 'Entered',
};

const initialFee: FeeType = {
  student: 0,
  school_class: '',
  fee_type: 'Monthly Tuition Fee',
  academic_year: String(new Date().getFullYear()),
  amount: 0,
  total_due: 0,
  due_date: new Date().toISOString().slice(0, 10),
  payment_method: 'Cash',
  notes: '',
  status: 'Pending',
};

const initialFeePayment: FeePaymentType = {
  fee: 0,
  amount: 0,
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'Cash',
  notes: '',
};

const initialHomework: HomeworkType = {
  title: '',
  description: '',
  school_class: '',
  subject: '',
  due_date: new Date().toISOString().slice(0, 10),
};

const initialAnnouncement: AnnouncementType = {
  title: '',
  content: '',
  audience: 'Everyone',
  status: 'Published',
};

type SectionKey = 'dashboard' | 'students' | 'teachers' | 'classes' | 'attendance' | 'timetable' | 'reports' | 'exams' | 'fees' | 'homework' | 'announcements' | 'settings';

type ToastType = {
  id: number;
  title: string;
  message: string;
  variant: 'info' | 'success' | 'error' | 'confirm';
  confirmText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

const initialSettings: SettingsType = {
  school_name: 'Rayan Tech Solutions School',
  phone: '',
  address: '',
  academic_year: String(new Date().getFullYear()),
};

function App() {
  const { locale, setLocale, t, formatDate, formatNumber } = useI18n();
  const [token, setToken] = useState<string>(authStorage.getItem('school_token') || '');
  const [user, setUser] = useState<UserType | null>(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('adminpass123');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [branding, setBranding] = useState<BrandingType>({ school_name: 'School Management System' });
  const [sessionExpired, setSessionExpired] = useState(new URLSearchParams(window.location.search).get('session') === 'expired');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);
  const [reports, setReports] = useState<ReportType | null>(null);
  const [teacherDashboard, setTeacherDashboard] = useState<TeacherDashboardType | null>(null);
  const [students, setStudents] = useState<StudentType[]>([]);
  const [teachers, setTeachers] = useState<TeacherType[]>([]);
  const [classes, setClasses] = useState<ClassType[]>([]);
  const [timetable, setTimetable] = useState<TimetableType[]>([]);
  const [attendance, setAttendance] = useState<AttendanceType[]>([]);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [results, setResults] = useState<ResultType[]>([]);
  const [fees, setFees] = useState<FeeType[]>([]);
  const [homework, setHomework] = useState<HomeworkType[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementType[]>([]);
    const [settings, setSettings] = useState<SettingsType>(initialSettings);
  const [studentForm, setStudentForm] = useState<StudentType>(initialStudent);
  const [studentEditId, setStudentEditId] = useState<number | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [studentDetailId, setStudentDetailId] = useState<number | null>(null);
  const [studentFormOpen, setStudentFormOpen] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [teacherEditId, setTeacherEditId] = useState<number | null>(null);
  const [teacherForm, setTeacherForm] = useState<TeacherFormType>(initialTeacherForm);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [teacherClassFilter, setTeacherClassFilter] = useState('all');
  const [teacherDetailId, setTeacherDetailId] = useState<number | null>(null);
  const [teacherFormOpen, setTeacherFormOpen] = useState(false);
  const [teacherLoading, setTeacherLoading] = useState(false);
    const [accountLoading, setAccountLoading] = useState(false);
  const [classEditId, setClassEditId] = useState<number | null>(null);
  const [classForm, setClassForm] = useState<ClassType>({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
  const [classSearch, setClassSearch] = useState('');
  const [classGradeFilter, setClassGradeFilter] = useState('all');
  const [classStatusFilter, setClassStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [classDetailId, setClassDetailId] = useState<number | null>(null);
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState<AttendanceType>(initialAttendance);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [attendanceClassFilter, setAttendanceClassFilter] = useState('all');
  const [attendanceTeacherFilter, setAttendanceTeacherFilter] = useState('all');
  const [attendanceByStudent, setAttendanceByStudent] = useState<Record<number, string>>({});
  const [examForm, setExamForm] = useState<ExamType>(initialExam);
  const [timetableForm, setTimetableForm] = useState<TimetableType>(initialTimetable);
  const [resultForm, setResultForm] = useState<ResultType>(initialResult);
  const [examSearch, setExamSearch] = useState('');
  const [examClassFilter, setExamClassFilter] = useState('all');
  const [examTypeFilter, setExamTypeFilter] = useState('all');
  const [examYearFilter, setExamYearFilter] = useState('all');
  const [examStatusFilter, setExamStatusFilter] = useState('all');
  const [examActionMenuId, setExamActionMenuId] = useState<number | null>(null);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examView, setExamView] = useState<'list' | 'details' | 'entry' | 'results'>('list');
  const [resultEntrySubject, setResultEntrySubject] = useState('');
  const [resultEntryMaxMarks, setResultEntryMaxMarks] = useState(100);
  const [resultEntryMarks, setResultEntryMarks] = useState<Record<number, string>>({});
  const [resultSearch, setResultSearch] = useState('');
  const [resultSubjectFilter, setResultSubjectFilter] = useState('all');
  const [resultSaving, setResultSaving] = useState(false);
  const [feeForm, setFeeForm] = useState<FeeType>(initialFee);
  const [feePaymentForm, setFeePaymentForm] = useState<FeePaymentType>(initialFeePayment);
  const [feeSearch, setFeeSearch] = useState('');
  const [feeClassFilter, setFeeClassFilter] = useState('all');
  const [feeTypeFilter, setFeeTypeFilter] = useState('all');
  const [feeAcademicYearFilter, setFeeAcademicYearFilter] = useState('all');
  const [feeStatusFilter, setFeeStatusFilter] = useState('all');
  const [feeStudentSearch, setFeeStudentSearch] = useState('');
  const [feeStudentClassFilter, setFeeStudentClassFilter] = useState('all');
  const [feeActionMenuId, setFeeActionMenuId] = useState<number | null>(null);
  const [showAddFeeModal, setShowAddFeeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [showFeeDetailsModal, setShowFeeDetailsModal] = useState(false);
  const [selectedFeeId, setSelectedFeeId] = useState<number | null>(null);
  const [timetableClassFilter, setTimetableClassFilter] = useState('all');
  const [timetableTeacherFilter, setTimetableTeacherFilter] = useState('all');
  const [homeworkForm, setHomeworkForm] = useState<HomeworkType>(initialHomework);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementType>(initialAnnouncement);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementDetail, setAnnouncementDetail] = useState<AnnouncementType | null>(null);
  const [announcementSearch, setAnnouncementSearch] = useState('');
  const [announcementAudienceFilter, setAnnouncementAudienceFilter] = useState('all');
  const [announcementStatusFilter, setAnnouncementStatusFilter] = useState('all');
  const [profileForm, setProfileForm] = useState<UserType | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(JSON.parse(localStorage.getItem('school_read_notifications') || '[]'));
  const [reportMode, setReportMode] = useState('summary');
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [reportClassFilter, setReportClassFilter] = useState('all');
  const [reportStudentFilter, setReportStudentFilter] = useState('all');
  const [reportStatusFilter, setReportStatusFilter] = useState('all');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [teacherClassId, setTeacherClassId] = useState<number | null>(null);
  const [teacherDashboardLoading, setTeacherDashboardLoading] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState('');
  const [reportExamFilter, setReportExamFilter] = useState('all');
  const [reportSubjectFilter, setReportSubjectFilter] = useState('all');
  const [reportGenderFilter, setReportGenderFilter] = useState('all');
  const [reportLoading, setReportLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const showToast = (toast: Omit<ToastType, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);

    if (toast.variant !== 'confirm') {
      window.setTimeout(() => dismissToast(id), 2800);
    }

    return id;
  };

  useEffect(() => {
    fetch(`${API_BASE}/school-branding/`).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setBranding(data as BrandingType); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (error) {
      showToast({ title: 'Action failed', message: error, variant: 'error' });
    }
  }, [error]);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const handleOutsideClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notificationOpen]);

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setToasts((current) => current.filter((toast) => toast.variant !== 'confirm'));
    let id = 0;
    id = showToast({
      title,
      message,
      variant: 'confirm',
      confirmText: 'Confirm',
      onConfirm: () => {
        onConfirm();
        dismissToast(id);
      },
      onCancel: () => dismissToast(id),
    });
  };

  const handleSessionExpired = () => {
    handleLogout();
    setSessionExpired(true);
    window.history.replaceState({}, '', `${window.location.pathname}?session=expired`);
  };

  const loadDashboard = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/dashboard/`, { headers: authHeaders });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error('Unauthorized');
      const data = await response.json();
      setDashboard(data);
    } catch (err) {
      setError('Unable to load dashboard');
    }
  };

  const loadTeacherDashboard = async () => {
    if (!token) return;
    setTeacherDashboardLoading(true);
    try {
      const response = await fetch(`${API_BASE}/teacher-dashboard/`, { headers: authHeaders });
      if (!response.ok) throw new Error('Unable to load teacher dashboard');
      const data = await response.json();
      setTeacherDashboard(data);
    } catch (err) {
      setTeacherDashboard(null);
      setError(err instanceof Error ? err.message : 'Unable to load teacher dashboard');
    } finally {
      setTeacherDashboardLoading(false);
    }
  };

  const loadCollections = async () => {
    if (!token) return;
    const endpoints = [
      ['students', `${API_BASE}/students/`],
      ['teachers', `${API_BASE}/teachers/`],
      ['classes', `${API_BASE}/classes/`],
      ['timetable', `${API_BASE}/timetable/`],
      ['reports', `${API_BASE}/reports/`],
      ['attendance', `${API_BASE}/attendance/`],
      ['exams', `${API_BASE}/exams/`],
      ['results', `${API_BASE}/results/`],
      ['fees', `${API_BASE}/fees/`],
      ['homework', `${API_BASE}/homework/`],
      ['announcements', `${API_BASE}/announcements/`],
    ] as const;

    for (const [key, url] of endpoints) {
      const response = await fetch(url, { headers: authHeaders });
      if (response.ok) {
        const data = await response.json();
        if (key === 'students') setStudents(data as StudentType[]);
        if (key === 'teachers') setTeachers(data as TeacherType[]);
        if (key === 'classes') setClasses(data as ClassType[]);
        if (key === 'timetable') setTimetable(data as TimetableType[]);
        if (key === 'reports') setReports(data as ReportType);
        if (key === 'attendance') setAttendance(data as AttendanceType[]);
        if (key === 'exams') setExams(data as ExamType[]);
        if (key === 'results') setResults(data as ResultType[]);
        if (key === 'fees') setFees(data as FeeType[]);
        if (key === 'homework') setHomework(data as HomeworkType[]);
        if (key === 'announcements') setAnnouncements(data as AnnouncementType[]);
      }
    }
    const settingsResponse = await fetch(`${API_BASE}/settings/`, { headers: authHeaders });
    if (settingsResponse.ok) setSettings(await settingsResponse.json() as SettingsType);
  };

  useEffect(() => {
    if (token) {
      const savedUser = authStorage.getItem('school_user');
      const parsedUser = savedUser ? JSON.parse(savedUser) as UserType : null;
      setUser(parsedUser);
      if (parsedUser?.role === 'teacher') loadTeacherDashboard();
      else loadDashboard();
      loadCollections();
    }
  }, [token]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as { detail?: string; access?: string; refresh?: string; user?: UserType };
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      if (!data.access || !data.user) throw new Error('Login failed');

      authStorage.setItem('school_token', data.access);
      if (data.refresh) authStorage.setItem('school_refresh_token', data.refresh);
      authStorage.setItem('school_user', JSON.stringify(data.user));
      setToken(data.access);
      setUser(data.user);
      setActiveSection(data.user.role === 'teacher' ? 'teachers' : 'dashboard');
      setSessionExpired(false);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/forgot-password/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: forgotIdentifier }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to process password help request');
      showToast({ title: 'Password help', message: data.detail, variant: 'info' });
      setForgotPasswordOpen(false);
      setForgotIdentifier('');
    } catch (err) {
      showToast({ title: 'Password help failed', message: err instanceof Error ? err.message : 'Unable to process password help request', variant: 'error' });
    }
  };

  const handleStudentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!studentForm.student_id.trim() || !studentForm.name.trim() || !studentForm.father_name.trim() || !studentForm.contact_number.trim() || !studentForm.school_class || !studentForm.date_of_birth) {
      setError('Student ID, name, guardian, class, DOB, and phone number are required.');
      return;
    }

    if (!/^\+?[0-9\s-]{7,}$/.test(studentForm.contact_number.trim())) {
      setError('Please enter a valid phone number.');
      return;
    }

    const duplicateStudent = students.find((student) => student.student_id.trim().toLowerCase() === studentForm.student_id.trim().toLowerCase() && student.id !== studentEditId);
    if (duplicateStudent) {
      setError('A student with this ID already exists.');
      return;
    }

    setStudentLoading(true);
    setError('');

    try {
      const url = studentEditId ? `${API_BASE}/students/${studentEditId}/` : `${API_BASE}/students/`;
      const method = studentEditId ? 'PUT' : 'POST';
      const payload = {
        ...studentForm,
        school_class: Number(studentForm.school_class),
        is_active: studentForm.is_active ?? true,
      };

      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.student_id?.[0] || data?.non_field_errors?.[0] || 'Unable to save student';
        throw new Error(detail);
      }
      const savedStudent = data as StudentType;
      setStudents((current) => {
        if (studentEditId) {
          return current.map((item) => item.id === studentEditId ? { ...savedStudent, school_class_name: savedStudent.school_class_name || classes.find((classItem) => String(classItem.id) === String(savedStudent.school_class))?.name } : item);
        }
        return [{ ...savedStudent, school_class_name: savedStudent.school_class_name || classes.find((classItem) => String(classItem.id) === String(savedStudent.school_class))?.name }, ...current];
      });
      setStudentForm(initialStudent);
      setStudentEditId(null);
      setStudentFormOpen(false);
      setStudentDetailId(savedStudent.id ?? null);
      showToast({ title: 'Student saved', message: studentEditId ? 'Student information updated successfully.' : 'Student added successfully.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save student');
    } finally {
      setStudentLoading(false);
    }
  };

  const handleEditStudent = (student: StudentType) => {
    setStudentEditId(student.id ?? null);
    setStudentForm({
      ...student,
      school_class: student.school_class ?? '',
      fee_status: student.fee_status || 'Pending',
      is_active: student.is_active ?? true,
    });
    setStudentFormOpen(true);
    setStudentDetailId(student.id ?? null);
  };

  const handleStudentStatusToggle = async (student: StudentType) => {
    if (!student.id) return;
    const isActive = student.is_active !== false;
    try {
      const response = await fetch(`${API_BASE}/students/${student.id}/`, {
        method: isActive ? 'DELETE' : 'PATCH',
        headers: authHeaders,
        ...(isActive ? {} : { body: JSON.stringify({ is_active: true }) }),
      });
      if (!response.ok) throw new Error(isActive ? 'Unable to deactivate student' : 'Unable to activate student');
      const updatedStudent = isActive ? { ...student, is_active: false } : await response.json() as StudentType;
      setStudents((current) => current.map((item) => item.id === student.id ? { ...item, ...updatedStudent, is_active: !isActive } : item));
      if (studentEditId === student.id) {
        setStudentEditId(null);
        setStudentForm(initialStudent);
      }
      setStudentDetailId(student.id);
      showToast({ title: isActive ? 'Student deactivated' : 'Student activated', message: isActive ? 'The student was deactivated successfully.' : 'The student is active again.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : isActive ? 'Unable to deactivate student' : 'Unable to activate student');
    }
  };

  const handleTeacherSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!teacherForm.name.trim() || !teacherForm.subject.trim() || !teacherForm.teacher_id.trim() || !teacherForm.phone_number.trim()) {
      setError('Teacher ID, name, phone number, and subject are required');
      return;
    }

    const duplicateTeacher = teachers.find((teacher) => teacher.teacher_id?.trim().toLowerCase() === teacherForm.teacher_id.trim().toLowerCase() && teacher.id !== teacherEditId);
    if (duplicateTeacher) {
      setError('A teacher with this ID already exists.');
      return;
    }

    setTeacherLoading(true);

    try {
      const url = teacherEditId ? `${API_BASE}/teachers/${teacherEditId}/` : `${API_BASE}/teachers/`;
      const method = teacherEditId ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          teacher_id: teacherForm.teacher_id,
          name: teacherForm.name,
          phone_number: teacherForm.phone_number,
          subject: teacherForm.subject,
          status: teacherForm.status,
          assigned_classes: teacherForm.assigned_classes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.non_field_errors?.[0] || data?.teacher_id?.[0] || 'Unable to save teacher';
        throw new Error(detail);
      }
      const savedTeacher = data as TeacherType;
      if (savedTeacher.id && teacherForm.account_username && teacherForm.temporary_password) {
        const accountResponse = await fetch(`${API_BASE}/teachers/${savedTeacher.id}/account/`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            username: teacherForm.account_username,
            email: teacherForm.account_email,
            temporary_password: teacherForm.temporary_password,
            status: teacherForm.account_status,
            must_change_password: teacherForm.must_change_password,
          }),
        });
        const accountData = await accountResponse.json().catch(() => ({}));
        if (!accountResponse.ok) throw new Error(accountData?.detail || 'Unable to create teacher account');
        if (accountData.teacher) Object.assign(savedTeacher, accountData.teacher);
        showToast({ title: 'Account ready', message: `Teacher account created for ${teacherForm.account_username}.`, variant: 'success' });
      } else if (savedTeacher.id && teacherEditId && teacherForm.account_username) {
        const accountResponse = await fetch(`${API_BASE}/teachers/${savedTeacher.id}/account/`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ username: teacherForm.account_username, email: teacherForm.account_email, status: teacherForm.account_status, must_change_password: teacherForm.must_change_password }),
        });
        const accountData = await accountResponse.json().catch(() => ({}));
        if (!accountResponse.ok) throw new Error(accountData?.detail || 'Unable to update teacher account');
      }
      setTeachers((current) => {
        if (teacherEditId) {
          return current.map((item) => item.id === teacherEditId ? savedTeacher : item);
        }
        return [savedTeacher, ...current];
      });
      setTeacherForm(initialTeacherForm);
      setTeacherEditId(null);
      setTeacherFormOpen(false);
      setTeacherDetailId(savedTeacher.id ?? null);
      showToast({ title: 'Teacher saved', message: teacherEditId ? 'Teacher information updated successfully.' : 'Teacher added successfully.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save teacher');
    } finally {
      setTeacherLoading(false);
    }
  };

  const handleTeacherStatusToggle = async (teacher: TeacherType) => {
    if (!teacher.id) return;
    const nextStatus = teacher.status === 'Active' ? 'Inactive' : 'Active';

    try {
      const response = await fetch(`${API_BASE}/teachers/${teacher.id}/`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          ...teacher,
          status: nextStatus,
          assigned_classes: teacher.assigned_classes || [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Unable to update teacher status');
      }
      const updatedTeacher = data as TeacherType;
      setTeachers((current) => current.map((item) => item.id === teacher.id ? updatedTeacher : item));
      showToast({ title: nextStatus === 'Active' ? 'Teacher activated' : 'Teacher deactivated', message: nextStatus === 'Active' ? 'Teacher is now active again.' : 'Teacher deactivated successfully.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update teacher status');
      showToast({ title: 'Status update failed', message: err instanceof Error ? err.message : 'Unable to update teacher status', variant: 'error' });
    }
  };

  const handleTeacherPasswordReset = async (teacher: TeacherType) => {
    if (!teacher.id || !teacher.account_username) return;
    const temporaryPassword = window.prompt('Enter a new temporary password for this teacher:')?.trim();
    if (!temporaryPassword) return;
    setAccountLoading(true);
    try {
      const response = await fetch(`${API_BASE}/teachers/${teacher.id}/account/reset-password/`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ temporary_password: temporaryPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to reset password');
      showToast({ title: 'Password reset', message: `New temporary credentials prepared for ${teacher.name}.`, variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setAccountLoading(false);
    }
  };

  const handleClassSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = classForm.name.trim();
    const trimmedGrade = classForm.grade?.trim() || '';
    const trimmedYear = classForm.academic_year?.trim() || String(new Date().getFullYear());
    if (!trimmedName || !trimmedGrade) {
      setError('Class name and grade are required');
      return;
    }
    try {
      const url = classEditId ? `${API_BASE}/classes/${classEditId}/` : `${API_BASE}/classes/`;
      const method = classEditId ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          name: trimmedName,
          grade: trimmedGrade,
          academic_year: trimmedYear,
          subjects: classForm.subjects || [],
          status: classForm.status || 'Active',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.name?.[0] || 'Unable to save class';
        throw new Error(detail);
      }
      const savedClass = data as ClassType;
      setClasses((current) => {
        if (classEditId) {
          return current.map((item) => item.id === classEditId ? savedClass : item);
        }
        return [savedClass, ...current];
      });
      setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
      setClassEditId(null);
      setClassFormOpen(false);
      showToast({ title: 'Class saved', message: classEditId ? 'Class updated successfully.' : 'Class created successfully.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save class');
    }
  };

  const handleClassStatusToggle = async (classItem: ClassType) => {
    if (!classItem.id) return;
    const isActive = classItem.status !== 'Inactive';
    try {
      const response = await fetch(`${API_BASE}/classes/${classItem.id}/`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: isActive ? 'Inactive' : 'Active' }),
      });
      if (!response.ok) throw new Error(isActive ? 'Unable to deactivate class' : 'Unable to activate class');
      const updatedClass = isActive ? { ...classItem, status: 'Inactive' } : await response.json() as ClassType;
      setClasses((current) => current.map((item) => item.id === classItem.id ? { ...item, ...updatedClass, status: isActive ? 'Inactive' : 'Active' } : item));
      if (selectedClassId === String(classItem.id)) setSelectedClassId('');
      if (classEditId === classItem.id) {
        setClassEditId(null);
        setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
      }
      showToast({ title: isActive ? 'Class deactivated' : 'Class activated', message: isActive ? 'The class was deactivated without deleting its historical records.' : 'The class is active again.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : isActive ? 'Unable to deactivate class' : 'Unable to activate class');
      showToast({ title: isActive ? 'Deactivation failed' : 'Activation failed', message: err instanceof Error ? err.message : isActive ? 'Unable to deactivate class' : 'Unable to activate class', variant: 'error' });
    }
  };

  const handleTimetableSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!timetableForm.day || !timetableForm.school_class || !timetableForm.teacher || !timetableForm.subject.trim() || !timetableForm.start_time || !timetableForm.end_time) {
      setError('Please complete all timetable fields before saving.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/timetable/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(timetableForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || 'Unable to save timetable entry';
        throw new Error(detail);
      }
      const created = data as TimetableType;
      setTimetable((current) => [created, ...current]);
      setTimetableForm(initialTimetable);
      setError('');
      showToast({ title: 'Timetable saved', message: 'Timetable entry was saved successfully.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save timetable entry');
    }
  };

  const handleAttendanceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClassId) {
      setError('Please select a class first');
      return;
    }

    const selectedStudents = students.filter((student) => String(student.school_class) === selectedClassId || String(student.school_class ?? '') === selectedClassId);
    const entries = selectedStudents
      .map((student) => {
        const status = student.id !== undefined ? attendanceByStudent[student.id] : null;
        if (!status) return null;
        return {
          student: student.id,
          school_class: Number(selectedClassId),
          attendance_date: attendanceForm.attendance_date,
          status,
          remarks: `Marked by ${user?.username || 'admin'}`,
        };
      })
      .filter(Boolean) as Array<{ student?: number; school_class: number; attendance_date: string; status: string; remarks: string }>;

    if (!entries.length) {
      setError('Please mark at least one student attendance status');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/attendance/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(entries),
      });
      if (!response.ok) throw new Error('Unable to save attendance');
      const created = (await response.json()) as AttendanceType[];
      setAttendance((current) => [...created, ...current]);
      setAttendanceByStudent({});
      setError('');
      showToast({ title: 'Attendance saved', message: 'Attendance was recorded for the selected class.', variant: 'success' });
      if (user?.role === 'teacher') loadTeacherDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance');
    }
  };

  const handleExamSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!examForm.name.trim() || !examForm.school_class || !examForm.exam_type || !examForm.academic_year || !examForm.start_date || !examForm.end_date) {
      showToast({ title: 'Exam details required', message: 'Exam name, type, academic year, class, and dates are required.', variant: 'error' });
      return;
    }
    const selectedClass = classes.find((item) => String(item.id) === String(examForm.school_class));
    const classSubjects = selectedClass?.available_subjects || selectedClass?.subjects || [];
    const selectedSubjects = examForm.subjects?.filter((subject) => classSubjects.includes(subject)) || [];
    if (!classSubjects.length) {
      showToast({ title: 'No subjects assigned', message: 'Please configure the selected class subjects first.', variant: 'error' });
      return;
    }
    if (!selectedSubjects.length) {
      showToast({ title: 'Subject required', message: 'Select at least one subject for this examination.', variant: 'error' });
      return;
    }
    if (examForm.end_date < examForm.start_date) {
      showToast({ title: 'Invalid dates', message: 'End date cannot be before start date.', variant: 'error' });
      return;
    }
    if (!examForm.max_marks || examForm.max_marks <= 0) {
      showToast({ title: 'Invalid maximum marks', message: 'Maximum marks must be greater than zero.', variant: 'error' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/exams/${examForm.id ? `${examForm.id}/` : ''}`, {
        method: examForm.id ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...examForm,
          subject: selectedSubjects[0],
          subjects: selectedSubjects,
          exam_date: examForm.start_date,
          max_marks: examForm.max_marks || 100,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.subjects?.[0] || data?.name?.[0] || 'Unable to save exam';
        throw new Error(detail);
      }
      const savedExam = data as ExamType;
      setExams((current) => examForm.id ? current.map((item) => item.id === examForm.id ? savedExam : item) : [savedExam, ...current]);
      setExamForm(initialExam);
      setExamModalOpen(false);
      showToast({ title: examForm.id ? 'Exam updated' : 'Exam created', message: 'The examination was saved successfully.', variant: 'success' });
      setError('');
    } catch (err) {
      showToast({ title: 'Exam save failed', message: err instanceof Error ? err.message : 'Unable to save exam', variant: 'error' });
    }
  };

  const handleBulkResultSubmit = async (event: FormEvent<HTMLFormElement>, exam: ExamType, studentsForClass: StudentType[]) => {
    event.preventDefault();
    if (!resultEntrySubject || resultEntryMaxMarks <= 0) {
      showToast({ title: 'Result details required', message: 'Select a subject and enter a valid maximum mark.', variant: 'error' });
      return;
    }
    const entries = studentsForClass.filter((student) => student.id && resultEntryMarks[student.id] !== undefined && resultEntryMarks[student.id] !== '');
    const invalidEntry = entries.find((student) => {
      const marks = Number(resultEntryMarks[student.id ?? 0]);
      return !Number.isFinite(marks) || marks < 0 || marks > resultEntryMaxMarks;
    });
    if (invalidEntry) {
      showToast({ title: 'Invalid marks', message: `Marks for ${invalidEntry.name} must be between 0 and ${resultEntryMaxMarks}.`, variant: 'error' });
      return;
    }
    if (entries.length === 0) {
      showToast({ title: 'No results entered', message: 'Enter marks for at least one student before saving.', variant: 'error' });
      return;
    }
    setResultSaving(true);
    try {
      await Promise.all(entries.map(async (student) => {
        const marks = Number(resultEntryMarks[student.id ?? 0]);
        const percentage = Number(((marks / resultEntryMaxMarks) * 100).toFixed(2));
        const grade = percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'E';
        const existing = results.find((result) => result.exam === exam.id && result.student === student.id && result.subject === resultEntrySubject);
        const response = await fetch(`${API_BASE}/results/${existing?.id ? `${existing.id}/` : ''}`, {
          method: existing?.id ? 'PUT' : 'POST',
          headers: authHeaders,
          body: JSON.stringify({ student: student.id, exam: exam.id, subject: resultEntrySubject, marks, total_marks: resultEntryMaxMarks, percentage, grade, status: 'Entered' }),
        });
        if (!response.ok) throw new Error('Unable to save the results. Please try again.');
      }));
      const refreshed = await fetch(`${API_BASE}/results/`, { headers: authHeaders });
      if (refreshed.ok) setResults((await refreshed.json()) as ResultType[]);
      showToast({ title: 'Results saved', message: `${entries.length} result${entries.length === 1 ? '' : 's'} saved successfully.`, variant: 'success' });
      setError('');
      if (user?.role === 'teacher') loadTeacherDashboard();
    } catch (err) {
      showToast({ title: 'Results save failed', message: err instanceof Error ? err.message : 'Unable to save the results. Please try again.', variant: 'error' });
    } finally {
      setResultSaving(false);
    }
  };

  const handleResultSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedExam = exams.find((exam) => exam.id === resultForm.exam);
    const subject = (resultForm.subject || selectedExam?.subject || '').trim();

    if (!resultForm.student || !resultForm.exam || !subject || !resultForm.total_marks || resultForm.total_marks <= 0) {
      setError('Student, exam, subject, and total marks are required.');
      return;
    }

    const percentage = Number(((resultForm.marks / resultForm.total_marks) * 100).toFixed(2));
    const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'F';

    try {
      const response = await fetch(`${API_BASE}/results/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...resultForm,
          subject,
          percentage,
          grade,
          status: 'Entered',
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || data?.non_field_errors?.[0] || 'Unable to save result');
      }
      const created = (await response.json()) as ResultType;
      setResults((current) => [created, ...current]);
      setResultForm({ ...initialResult, exam: resultForm.exam, student: resultForm.student, total_marks: resultForm.total_marks });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save result');
    }
  };

  const handleFeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!feeForm.student || !feeForm.fee_type || !feeForm.amount || feeForm.amount <= 0 || !feeForm.due_date) {
      setError('Student, fee type, amount, and due date are required.');
      return;
    }

    const totalDue = Number(feeForm.total_due && feeForm.total_due > 0 ? feeForm.total_due : feeForm.amount);
    const paidAmount = Number(feeForm.paid_amount ?? 0);
    const calculatedRemaining = Math.max(totalDue - paidAmount, 0);

    if (paidAmount > totalDue) {
      setError('Paid amount cannot exceed the total due amount.');
      return;
    }

    try {
      const student = students.find((item) => item.id === feeForm.student);
      const payload = {
        ...feeForm,
        school_class: student?.school_class || feeForm.school_class || '',
        total_due: totalDue,
        amount: Number(feeForm.amount),
        paid_amount: paidAmount,
        remaining_amount: calculatedRemaining,
        payment_method: feeForm.payment_method || 'Cash',
        status: calculatedRemaining === 0 ? 'Paid' : paidAmount > 0 ? 'Partially Paid' : 'Pending',
      };

      const response = await fetch(`${API_BASE}/fees/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || data?.amount || data?.student || data?.due_date || 'Unable to save fee record');
      }
      const created = (await response.json()) as FeeType;
      setFees((current) => [created, ...current]);
      setFeeForm({ ...initialFee, paid_amount: 0, remaining_amount: 0 });
      setFeeStudentSearch('');
      setFeeStudentClassFilter('all');
      setShowAddFeeModal(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save fee record');
    }
  };

  const handleFeePaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!feePaymentForm.fee || !feePaymentForm.amount || feePaymentForm.amount <= 0) {
      setError('Select a fee record and enter a valid payment amount.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/fee-payments/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...feePaymentForm,
          payment_date: feePaymentForm.payment_date || new Date().toISOString().slice(0, 10),
          payment_method: feePaymentForm.payment_method || 'Cash',
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || data?.amount || 'Unable to save fee payment');
      }
      const nextFees = await fetch(`${API_BASE}/fees/`, { headers: authHeaders });
      if (nextFees.ok) {
        setFees((await nextFees.json()) as FeeType[]);
      }
      setFeePaymentForm(initialFeePayment);
      setError('');
      showToast({ title: 'Payment recorded', message: 'Fee payment was saved and the balance updated.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save fee payment');
    }
  };

  const handleHomeworkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    try {
      const response = await fetch(`${API_BASE}/homework/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...homeworkForm, created_by: user.id }),
      });
      if (!response.ok) throw new Error('Unable to save homework');
      const created = (await response.json()) as HomeworkType;
      setHomework((current) => [created, ...current]);
      setHomeworkForm(initialHomework);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save homework');
    }
  };

  const handleAnnouncementSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      showToast({ title: 'Announcement details required', message: 'Enter a title and announcement content.', variant: 'error' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/announcements/${announcementForm.id ? `${announcementForm.id}/` : ''}`, {
        method: announcementForm.id ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...announcementForm, created_by: user.id, school_class: announcementForm.audience === 'Class' ? announcementForm.school_class : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.school_class?.[0] || 'Unable to save announcement');
      const saved = data as AnnouncementType;
      setAnnouncements((current) => announcementForm.id ? current.map((item) => item.id === announcementForm.id ? saved : item) : [saved, ...current]);
      setAnnouncementForm(initialAnnouncement);
      setAnnouncementModalOpen(false);
      showToast({ title: announcementForm.id ? 'Announcement updated' : 'Announcement published', message: 'The announcement was saved successfully.', variant: 'success' });
    } catch (err) {
      showToast({ title: 'Announcement save failed', message: err instanceof Error ? err.message : 'Unable to save announcement', variant: 'error' });
    }
  };

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const body = new FormData();
      body.append('school_name', settings.school_name);
      body.append('phone', settings.phone);
      body.append('address', settings.address);
      body.append('academic_year', settings.academic_year);
      if (logoFile) body.append('logo', logoFile);
      const response = await fetch(`${API_BASE}/settings/`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to save settings');
      setSettings(data as SettingsType);
      setLogoFile(null);
      showToast({ title: 'Settings saved', message: 'School information was updated.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResource = async (resource: 'timetable' | 'exams' | 'results' | 'fees' | 'announcements', id?: number) => {
    if (!id) return;
    try {
      const response = await fetch(`${API_BASE}/${resource}/${id}/`, { method: 'DELETE', headers: authHeaders });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || `Unable to delete ${resource.slice(0, -1)}`);
      if (resource === 'timetable') setTimetable((current) => current.filter((item) => item.id !== id));
      if (resource === 'exams') setExams((current) => current.filter((item) => item.id !== id));
      if (resource === 'results') setResults((current) => current.filter((item) => item.id !== id));
      if (resource === 'fees') setFees((current) => current.filter((item) => item.id !== id));
      if (resource === 'announcements') setAnnouncements((current) => current.filter((item) => item.id !== id));
      showToast({ title: 'Deleted', message: 'The record was removed successfully.', variant: 'success' });
    } catch (err) {
      showToast({ title: 'Delete failed', message: err instanceof Error ? err.message : 'Unable to delete record', variant: 'error' });
    }
  };

  const handleLogout = () => {
    authStorage.removeItem('school_token');
    authStorage.removeItem('school_refresh_token');
    authStorage.removeItem('school_user');
    setToken('');
    setUser(null);
    setDashboard(null);
    setToasts([]);
    setNotificationOpen(false);
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/change-password/`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to change password');
      const updatedUser = { ...user, must_change_password: false } as UserType;
      authStorage.setItem('school_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setCurrentPassword('');
      setNewPassword('');
      showToast({ title: 'Password changed', message: 'Your account is ready to use.', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!token || !user) {
    return (
      <LocalizedContent><>
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.variant}`}>
              <div>
                <strong>{toast.title}</strong>
                <p>{toast.message}</p>
              </div>
              {toast.variant === 'confirm' && (
                <div className="toast-actions">
                  <button type="button" onClick={() => { toast.onConfirm?.(); }}>{toast.confirmText || 'OK'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { toast.onCancel?.(); }}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="login-shell">
          <form className="login-card enhanced-login-card" onSubmit={handleLogin} aria-labelledby="login-title">
            <label className="login-language-switcher"><span>{t('language.label')}</span><select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)} aria-label={t('language.label')}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.nativeLabel}</option>)}</select></label>
            <div className="login-branding">{branding.logo ? <img src={branding.logo} alt={`${branding.school_name} logo`} /> : <span className="login-brand-mark">{branding.school_name.slice(0, 1).toUpperCase()}</span>}<div><strong>{branding.school_name}</strong><small>Secure school administration</small></div></div>
            <span className="page-kicker">{t('brand.staffAccess')}</span>
            <h1 id="login-title">{t('auth.loginTitle')}</h1>
            <p>{t('auth.loginDescription')}</p>
            {sessionExpired && <div className="session-message" role="status">{t('auth.sessionExpired')}</div>}
            <label htmlFor="login-username">{t('auth.username')}</label>
            <input id="login-username" name="username" autoComplete="username" value={username} onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} required />
            <label htmlFor="login-password">{t('auth.password')}</label>
            <div className="password-input-wrap"><input id="login-password" name="password" type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required /><button type="button" className="password-toggle" aria-label={showLoginPassword ? t('auth.hidePassword') : t('auth.showPassword')} onClick={() => setShowLoginPassword((current) => !current)}>{showLoginPassword ? t('auth.hidePassword') : t('auth.showPassword')}</button></div>
            {error && <div className="error-box" role="alert">{error}</div>}
            <button type="submit" disabled={loading}>{loading ? t('auth.signingIn') : t('auth.login')}</button>
            <button type="button" className="forgot-link" onClick={() => setForgotPasswordOpen(true)}>{t('auth.forgotPassword')}</button>
          </form>
        </div>
        {forgotPasswordOpen && <div className="modal-backdrop"><section className="panel forgot-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title"><div className="modal-header"><div><span className="page-kicker">Account help</span><h3 id="forgot-title">Forgot password?</h3></div><button type="button" className="secondary-btn" onClick={() => setForgotPasswordOpen(false)}>Close</button></div><p>Enter your username or email. The school administrator will help verify and reset your account.</p><form onSubmit={handleForgotPassword}><label htmlFor="forgot-identifier">Username or email</label><input id="forgot-identifier" autoComplete="username" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} required /><div className="form-actions"><button type="button" className="secondary-btn" onClick={() => setForgotPasswordOpen(false)}>Cancel</button><button type="submit" className="primary-action-btn">Request help</button></div></form></section></div>}
      </></LocalizedContent>
    );
  }

  if (user.must_change_password) {
    return (
      <LocalizedContent><div className="login-shell">
        <form className="login-card" onSubmit={handleChangePassword}>
          <h1>{t('auth.changePassword')}</h1>
          <p>{t('auth.changePasswordDescription')}</p>
          <label>{t('auth.currentPassword')}<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label>{t('auth.newPassword')}<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? t('auth.saving') : t('auth.savePassword')}</button>
        </form>
      </div></LocalizedContent>
    );
  }

  const navItems: { key: SectionKey; label: string }[] = user?.role === 'teacher'
    ? [
        { key: 'teachers', label: t('nav.myDashboard') }, { key: 'classes', label: t('nav.myClasses') }, { key: 'timetable', label: t('nav.todayTimetable') }, { key: 'attendance', label: t('nav.attendance') }, { key: 'exams', label: t('nav.examResults') }, { key: 'homework', label: t('nav.homework') }, { key: 'announcements', label: t('nav.announcements') },
      ]
    : [
        { key: 'dashboard', label: t('nav.dashboard') }, { key: 'students', label: t('nav.students') }, { key: 'teachers', label: t('nav.teachers') }, { key: 'classes', label: t('nav.classes') }, { key: 'timetable', label: t('nav.timetable') }, { key: 'attendance', label: t('nav.attendance') }, { key: 'fees', label: t('nav.fees') }, { key: 'exams', label: t('nav.exams') }, { key: 'announcements', label: t('nav.announcements') }, { key: 'reports', label: t('nav.reports') }, { key: 'settings', label: t('nav.settings') }, { key: 'homework', label: t('nav.homework') },
      ];

  const attendanceSummary = typeof dashboard?.today_attendance === 'object' && dashboard?.today_attendance !== null
    ? dashboard.today_attendance as DashboardAttendanceSummary
    : {
        present: typeof dashboard?.today_attendance === 'number' ? dashboard.today_attendance : 0,
        absent: 0,
        late: 0,
        total: typeof dashboard?.today_attendance === 'number' ? dashboard.today_attendance : 0,
        by_class: [],
      };

  const notifications = [
    ...announcements.slice(0, 5).map((item) => ({ id: `announcement-${item.id}`, title: 'Announcement published', message: item.title, date: item.created_at, section: 'announcements' as SectionKey })),
    ...exams.slice(0, 4).map((item) => ({ id: `exam-${item.id}`, title: 'Examination updated', message: item.name, date: item.created_at, section: 'exams' as SectionKey })),
    ...fees.filter((item) => Number(item.remaining_amount ?? 0) > 0).slice(0, 3).map((item) => ({ id: `fee-${item.id}`, title: 'Outstanding fee reminder', message: `${item.student_name || 'Student'} has AFN ${formatNumber(Number(item.remaining_amount ?? 0))} remaining`, date: item.created_at, section: 'fees' as SectionKey })),
    ...(attendanceSummary.total === 0 ? [{ id: 'attendance-missing-today', title: 'Attendance not recorded', message: 'No attendance records have been recorded today.', date: new Date().toISOString(), section: 'attendance' as SectionKey }] : []),
    ...results.filter((item) => item.status !== 'Entered').slice(0, 2).map((item) => ({ id: `result-${item.id}`, title: 'Result requires attention', message: item.exam_name || 'An examination result is incomplete', date: undefined, section: 'exams' as SectionKey })),
  ];
  const unreadNotifications = notifications.filter((item) => !readNotificationIds.includes(item.id));
  const markNotificationRead = (id: string) => {
    const next = [...new Set([...readNotificationIds, id])];
    setReadNotificationIds(next);
    localStorage.setItem('school_read_notifications', JSON.stringify(next));
  };
  const markAllNotificationsRead = () => {
    const next = notifications.map((item) => item.id);
    setReadNotificationIds(next);
    localStorage.setItem('school_read_notifications', JSON.stringify(next));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileForm) return;
    setProfileLoading(true);
    try {
      const response = await fetch(`${API_BASE}/profile/`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ username: profileForm.username, email: profileForm.email, first_name: profileForm.first_name || '', last_name: profileForm.last_name || '' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.username?.[0] || 'Unable to update profile');
      setUser(data as UserType);
      authStorage.setItem('school_user', JSON.stringify(data));
      showToast({ title: 'Profile updated', message: 'Your administrator profile was saved.', variant: 'success' });
    } catch (err) {
      showToast({ title: 'Profile update failed', message: err instanceof Error ? err.message : 'Unable to update profile', variant: 'error' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    try {
      const response = await fetch(`${API_BASE}/logout-all/`, { method: 'POST', headers: authHeaders });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to sign out active sessions');
      showToast({ title: 'Signed out everywhere', message: 'All active sessions have been revoked.', variant: 'success' });
      handleLogout();
    } catch (err) {
      showToast({ title: 'Sign out failed', message: err instanceof Error ? err.message : 'Unable to sign out active sessions', variant: 'error' });
    }
  };

  const renderDashboard = () => (
    <>
      <header className="topbar dashboard-header">
        <div>
          <span className="page-kicker">School administration · {formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <h3>Dashboard</h3>
          <p>{t('dashboard.greeting')} {user.username}. {t('dashboard.overview')}</p>
        </div>
        <div className="dashboard-topbar-actions">
          <div className="notification-wrap" ref={notificationRef}><button type="button" className="icon-btn notification-button" aria-label="Notifications" onClick={() => setNotificationOpen((current) => !current)}>🔔{unreadNotifications.length > 0 && <span className="notification-count">{unreadNotifications.length}</span>}</button>{notificationOpen && <div className="notification-panel"><div className="notification-panel-header"><strong>Notifications</strong><button type="button" onClick={markAllNotificationsRead}>Mark all read</button></div>{notifications.length === 0 ? <p className="empty-text">No notifications.</p> : notifications.slice(0, 10).map((notification) => <button type="button" className={`notification-item ${readNotificationIds.includes(notification.id) ? 'read' : ''}`} key={notification.id} onClick={() => { markNotificationRead(notification.id); setNotificationOpen(false); setActiveSection(notification.section); }}><span className="notification-dot" /><span><strong>{notification.title}</strong><small>{notification.message}</small><em>{notification.date ? formatDate(notification.date, { dateStyle: 'medium', timeStyle: 'short' }) : 'Today'}</em></span></button>)}</div>}</div>
          <div className="user-badge" role="button" tabIndex={0} onClick={() => { setProfileForm(user); setActiveSection('settings'); }}>
            <span className="avatar">{(user.first_name?.[0] || user.username[0] || 'A').toUpperCase()}</span>
            <div>
              <strong>{user.full_name || user.username}</strong>
              <small>{user.role === 'admin' ? 'School Admin' : 'Teacher'}</small>
            </div>
          </div>
        </div>
      </header>

      <section className="cards dashboard-summary-cards">
        <button type="button" className="stat-card click-card" onClick={() => setActiveSection('students')}>
          <span>Total Students</span>
          <strong>{dashboard?.student_count ?? 0}</strong>
        </button>
        <button type="button" className="stat-card click-card" onClick={() => setActiveSection('teachers')}>
          <span>Total Teachers</span>
          <strong>{dashboard?.teacher_count ?? 0}</strong>
        </button>
        <button type="button" className="stat-card click-card" onClick={() => setActiveSection('attendance')}>
          <span>Today's Attendance</span>
          <strong>{attendanceSummary.present ?? 0}</strong>
          <small>{attendanceSummary.absent ?? 0} absent • {attendanceSummary.late ?? 0} late</small>
        </button>
        <div className="stat-card pending-fees-card">
          <span>Pending Fees</span>
          <strong>{dashboard?.pending_fees ?? 'Coming Soon'}</strong>
          <small>{typeof dashboard?.pending_fees === 'number' ? 'Real pending fees' : 'Fees module coming soon'}</small>
        </div>
      </section>

      <section className="panel-grid dashboard-panels">
        <div className="panel dashboard-quick-panel">
          <h4>Quick Actions</h4>
          <div className="quick-actions">
            <button type="button" onClick={() => setActiveSection('students')}>+ Add Student</button>
            <button type="button" onClick={() => setActiveSection('attendance')}>Take Attendance</button>
            <button type="button" onClick={() => setActiveSection('fees')}>Collect Fee</button>
            <button type="button" onClick={() => setActiveSection('exams')}>Enter Exam Results</button>
          </div>
        </div>

        <div className="panel dashboard-announcements-panel">
          <h4>Latest Announcements</h4>
          {((dashboard?.latest_announcements || announcements).length ? (dashboard?.latest_announcements || announcements) : []).slice(0, 4).length > 0 ? (
            <ul className="simple-list dashboard-announcement-list">
              {((dashboard?.latest_announcements || announcements).length ? (dashboard?.latest_announcements || announcements) : []).slice(0, 4).map((item) => (
                <li key={item.id || item.title}>{item.title}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">No announcements available.</p>
          )}
        </div>
      </section>

      <section className="panel overview-panel">
        <div className="overview-panel-header">
          <div>
            <span className="panel-kicker">Live</span>
            <h4>Today's School Overview</h4>
          </div>
          <span className="overview-status-pill">{attendanceSummary.total ? 'Updated' : 'Waiting for entry'}</span>
        </div>

        {attendanceSummary.total ? (
          <div className="attendance-overview">
            <div className="attendance-summary-grid">
              <div>
                <span>Present</span>
                <strong>{attendanceSummary.present ?? 0}</strong>
              </div>
              <div>
                <span>Absent</span>
                <strong>{attendanceSummary.absent ?? 0}</strong>
              </div>
              <div>
                <span>Late</span>
                <strong>{attendanceSummary.late ?? 0}</strong>
              </div>
            </div>
            <p className="attendance-rate">Attendance Rate: {attendanceSummary.total ? Math.round(((attendanceSummary.present ?? 0) / (attendanceSummary.total || 1)) * 100) : 0}%</p>
          </div>
        ) : (
          <div className="attendance-empty-state">
            <div className="attendance-empty-icon">✓</div>
            <div>
              <strong>No attendance has been recorded today.</strong>
              <p>Classes will appear here as soon as attendance is marked.</p>
            </div>
          </div>
        )}

        {attendanceSummary.by_class && attendanceSummary.by_class.length > 0 && (
          <div className="class-attendance-list">
            <h5>Attendance by Class</h5>
            <div className="class-table-header">
              <span>Class</span>
              <span>Present</span>
              <span>Absent</span>
              <span>Late</span>
            </div>
            <div className="class-table-body">
              {attendanceSummary.by_class.map((entry) => (
                <div className="class-row" key={entry.class_id ?? entry.class_name}>
                  <span className="class-name">{entry.class_name}</span>
                  <span className="count-pill count-present">{entry.present}</span>
                  <span className="count-pill count-absent">{entry.absent}</span>
                  <span className="count-pill count-late">{entry.late}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );

  const getStudentStatus = (student: StudentType) => (student.is_active === false ? 'Inactive' : 'Active');

  const filteredStudents = [...students]
    .filter((student) => {
      const query = studentSearch.trim().toLowerCase();
      const matchesSearch = !query || [
        student.name,
        student.student_id,
        student.father_name,
        student.contact_number,
        student.school_class_name || classes.find((classItem) => String(classItem.id) === String(student.school_class))?.name || '',
      ].some((value) => String(value || '').toLowerCase().includes(query));

      const matchesClass = studentClassFilter === 'all' || String(student.school_class ?? '') === String(studentClassFilter);
      const matchesStatus = studentStatusFilter === 'all' || getStudentStatus(student) === studentStatusFilter;

      return matchesSearch && matchesClass && matchesStatus;
    })
    .sort((a, b) => {
      const aClass = a.school_class_name || classes.find((classItem) => String(classItem.id) === String(a.school_class))?.name || '';
      const bClass = b.school_class_name || classes.find((classItem) => String(classItem.id) === String(b.school_class))?.name || '';
      return aClass.localeCompare(bClass) || (a.name || '').localeCompare(b.name || '');
    });

  const selectedStudent = studentDetailId ? students.find((student) => student.id === studentDetailId) ?? null : null;

  const renderStudents = () => (
    <>
      <header className="student-page-header">
        <div>
          <span className="page-kicker">Students</span>
          <h3>Students</h3>
          <p>Manage student records and class assignments.</p>
        </div>
        <button
          type="button"
          className="primary-action-btn"
          onClick={() => {
            setStudentEditId(null);
            setStudentForm({ ...initialStudent, is_active: true });
            setStudentFormOpen(true);
          }}
        >
          + Add Student
        </button>
      </header>

      {studentFormOpen && (
        <section className="panel student-form-panel">
          <div className="panel-header-row">
            <div>
              <span className="panel-kicker">Student Form</span>
              <h4>{studentEditId ? 'Edit Student' : 'Add Student'}</h4>
            </div>
            <button type="button" className="secondary-btn" onClick={() => {
              setStudentFormOpen(false);
              setStudentEditId(null);
              setStudentForm({ ...initialStudent, is_active: true });
            }}>Close</button>
          </div>

          <form onSubmit={handleStudentSubmit} className="student-form-grid">
            <div className="field-group">
              <label>Student ID</label>
              <input value={studentForm.student_id} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentForm({ ...studentForm, student_id: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Student Name</label>
              <input value={studentForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentForm({ ...studentForm, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Father / Guardian</label>
              <input value={studentForm.father_name} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentForm({ ...studentForm, father_name: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Gender</label>
              <select value={studentForm.gender} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStudentForm({ ...studentForm, gender: e.target.value })}>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div className="field-group">
              <label>Date of Birth</label>
              <input type="date" value={studentForm.date_of_birth} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentForm({ ...studentForm, date_of_birth: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Class</label>
              <select value={String(studentForm.school_class ?? '')} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStudentForm({ ...studentForm, school_class: e.target.value })}>
                <option value="">Select class</option>
                {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
              </select>
            </div>
            <div className="field-group">
              <label>Contact Number</label>
              <input value={studentForm.contact_number} onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentForm({ ...studentForm, contact_number: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Fee Status</label>
              <select value={studentForm.fee_status} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStudentForm({ ...studentForm, fee_status: e.target.value })}>
                <option>Paid</option>
                <option>Partially Paid</option>
                <option>Pending</option>
              </select>
            </div>
            <div className="field-group full-span">
              <label>Address</label>
              <textarea value={studentForm.address} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setStudentForm({ ...studentForm, address: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Status</label>
              <select value={studentForm.is_active === false ? 'Inactive' : 'Active'} onChange={(e) => setStudentForm({ ...studentForm, is_active: e.target.value === 'Active' })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
            <div className="field-group full-span">
              <label>Subjects for this class</label>
              <input value={(classForm.subjects || []).join(', ')} placeholder="Mathematics, English, Science" onChange={(e) => setClassForm({ ...classForm, subjects: e.target.value.split(',').map((subject) => subject.trim()).filter(Boolean) })} />
            </div>

            {error && <div className="error-box full-span">{error}</div>}

            <div className="form-actions full-span">
              <button type="button" className="secondary-btn" onClick={() => {
                setStudentFormOpen(false);
                setStudentEditId(null);
                setStudentForm({ ...initialStudent, is_active: true });
              }}>Cancel</button>
              <button type="submit" className="primary-action-btn" disabled={studentLoading}>
                {studentLoading ? 'Saving...' : 'Save Student'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel student-toolbar-panel">
        <div className="student-toolbar">
          <div className="search-field">
            <span>🔎</span>
            <input
              placeholder="Search students..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
          <select value={studentClassFilter} onChange={(e) => setStudentClassFilter(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
          </select>
          <select value={studentStatusFilter} onChange={(e) => setStudentStatusFilter(e.target.value as 'all' | 'Active' | 'Inactive')}>
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="student-workspace">
        <div className="panel student-list-panel">
          <div className="table-header-row">
            <h4>Student Directory</h4>
            <span>{filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'}</span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="empty-state">
              <h5>No students found.</h5>
              <p>There are no students matching your search or filters.</p>
              <button type="button" className="primary-action-btn" onClick={() => {
                setStudentFormOpen(true);
                setStudentEditId(null);
                setStudentForm({ ...initialStudent, is_active: true });
              }}>+ Add Student</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Student</th>
                    <th>Guardian</th>
                    <th>Class</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.student_id}</td>
                      <td>
                        <div className="student-name-cell">
                          <div className="avatar-circle">{student.name.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'ST'}</div>
                          <div>
                            <strong>{student.name}</strong>
                            <small>ID: {student.student_id}</small>
                          </div>
                        </div>
                      </td>
                      <td>{student.father_name}</td>
                      <td>{student.school_class_name || classes.find((classItem) => String(classItem.id) === String(student.school_class))?.name || 'Unassigned'}</td>
                      <td>{student.contact_number}</td>
                      <td>
                        <span className={`status-badge ${getStudentStatus(student) === 'Active' ? 'status-active' : 'status-inactive'}`}>
                          {getStudentStatus(student)}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="small-action-btn" onClick={() => setStudentDetailId(student.id ?? null)}>View</button>
                          <button type="button" className="small-action-btn" onClick={() => handleEditStudent(student)}>Edit</button>
                          <button type="button" className="small-action-btn danger" onClick={() => {
                            if (student.is_active === false) {
                              void handleStudentStatusToggle(student);
                            } else {
                              confirmAction('Deactivate Student', `This student will no longer appear as active, but their records will be preserved.`, () => { void handleStudentStatusToggle(student); });
                            }
                          }}>{student.is_active === false ? 'Activate' : 'Deactivate'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedStudent && (
          <aside className="panel student-detail-panel">
            <div className="detail-header">
              <button type="button" className="back-link" onClick={() => setStudentDetailId(null)}>← Back to students</button>
              <button type="button" className="small-action-btn" onClick={() => handleEditStudent(selectedStudent)}>Edit Student</button>
            </div>

            <div className="detail-profile">
              <div className="avatar-circle large-avatar">{selectedStudent.name.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'ST'}</div>
              <div>
                <h4>{selectedStudent.name}</h4>
                <p>Student ID: {selectedStudent.student_id}</p>
                <span className={`status-badge ${getStudentStatus(selectedStudent) === 'Active' ? 'status-active' : 'status-inactive'}`}>
                  {getStudentStatus(selectedStudent)}
                </span>
              </div>
            </div>

            <div className="detail-section">
              <h5>Student Information</h5>
              <div className="detail-grid">
                <div><span>Father / Guardian</span><strong>{selectedStudent.father_name}</strong></div>
                <div><span>Gender</span><strong>{selectedStudent.gender}</strong></div>
                <div><span>Date of Birth</span><strong>{selectedStudent.date_of_birth}</strong></div>
                <div><span>Phone</span><strong>{selectedStudent.contact_number}</strong></div>
                <div className="full-width"><span>Address</span><strong>{selectedStudent.address}</strong></div>
              </div>
            </div>

            <div className="detail-section">
              <h5>Academic / Class Information</h5>
              <div className="detail-grid">
                <div><span>Class</span><strong>{selectedStudent.school_class_name || classes.find((classItem) => String(classItem.id) === String(selectedStudent.school_class))?.name || 'Unassigned'}</strong></div>
                <div><span>Admission Date</span><strong>{selectedStudent.admission_date || '—'}</strong></div>
                <div><span>Fee Status</span><strong>{selectedStudent.fee_status}</strong></div>
              </div>
            </div>

            <div className="detail-section">
              <h5>Attendance</h5>
              {(() => {
                const studentAttendance = [...attendance]
                  .filter((item) => Number(item.student) === Number(selectedStudent.id))
                  .sort((a, b) => new Date(b.attendance_date).getTime() - new Date(a.attendance_date).getTime());

                const summary = studentAttendance.reduce(
                  (acc, item) => {
                    acc[item.status] = (acc[item.status] || 0) + 1;
                    return acc;
                  },
                  { Present: 0, Absent: 0, Late: 0 } as Record<string, number>,
                );

                return studentAttendance.length > 0 ? (
                  <>
                    <div className="attendance-mini-summary">
                      <span className="attendance-mini-pill present-pill">Present: {summary.Present ?? 0}</span>
                      <span className="attendance-mini-pill absent-pill">Absent: {summary.Absent ?? 0}</span>
                      <span className="attendance-mini-pill late-pill">Late: {summary.Late ?? 0}</span>
                    </div>

                    <div className="attendance-mini-list">
                      {studentAttendance.slice(0, 5).map((item) => (
                        <div key={`${item.id ?? item.student}-${item.attendance_date}`} className="attendance-mini-item">
                          <div>
                            <strong>{item.attendance_date}</strong>
                            <small>{item.remarks || 'No remarks'}</small>
                          </div>
                          <span className={`attendance-status-badge ${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="empty-text">No attendance record found for this student yet.</p>
                );
              })()}
            </div>
          </aside>
        )}
      </section>
    </>
  );

  const filteredTeachers = [...teachers]
    .filter((teacher) => {
      const query = teacherSearch.trim().toLowerCase();
      const classNames = teacher.assigned_class_names || [];
      const matchesSearch = !query || [
        teacher.name,
        teacher.teacher_id || '',
        teacher.phone_number || '',
        teacher.subject,
        classNames.join(' '),
      ].some((value) => String(value).toLowerCase().includes(query));

      const matchesClass = teacherClassFilter === 'all' || classNames.includes(classes.find((item) => String(item.id) === teacherClassFilter)?.name || '');
      const matchesStatus = teacherStatusFilter === 'all' || teacher.status === teacherStatusFilter;

      return matchesSearch && matchesClass && matchesStatus;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const selectedTeacher = teacherDetailId ? teachers.find((teacher) => teacher.id === teacherDetailId) ?? null : null;

  const renderTeachers = () => (
    <>
      <header className="student-page-header">
        <div>
          <span className="page-kicker">Teachers</span>
          <h3>Teachers</h3>
          <p>Manage teachers, subjects and class assignments.</p>
        </div>
        <button
          type="button"
          className="primary-action-btn"
          onClick={() => {
            setTeacherEditId(null);
            setTeacherForm(initialTeacherForm);
            setTeacherFormOpen(true);
          }}
        >
          + Add Teacher
        </button>
      </header>

      {teacherFormOpen && (
        <section className="panel student-form-panel">
          <div className="panel-header-row">
            <div>
              <span className="panel-kicker">Teacher Form</span>
              <h4>{teacherEditId ? 'Edit Teacher' : 'Add Teacher'}</h4>
            </div>
            <button type="button" className="secondary-btn" onClick={() => {
              setTeacherFormOpen(false);
              setTeacherEditId(null);
              setTeacherForm(initialTeacherForm);
            }}>Close</button>
          </div>

          <form onSubmit={handleTeacherSubmit} className="student-form-grid">
            <div className="field-group">
              <label>Teacher ID</label>
              <input value={teacherForm.teacher_id} onChange={(e) => setTeacherForm({ ...teacherForm, teacher_id: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Full Name</label>
              <input value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Phone Number</label>
              <input value={teacherForm.phone_number} onChange={(e) => setTeacherForm({ ...teacherForm, phone_number: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Subject</label>
              <input value={teacherForm.subject} onChange={(e) => setTeacherForm({ ...teacherForm, subject: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Status</label>
              <select value={teacherForm.status} onChange={(e) => setTeacherForm({ ...teacherForm, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="field-group full-span">
              <label>Assigned Classes</label>
              <select
                value={teacherForm.assigned_classes.map(String)}
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (option) => Number(option.value));
                  setTeacherForm({ ...teacherForm, assigned_classes: selected });
                }}
              >
                {classes.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="field-group full-span">
              <label>Create Teacher Login Account (optional)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label>Username</label>
                  <input value={teacherForm.account_username} onChange={(e) => setTeacherForm({ ...teacherForm, account_username: e.target.value })} placeholder="teacher01" />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={teacherForm.account_email} onChange={(e) => setTeacherForm({ ...teacherForm, account_email: e.target.value })} placeholder="teacher@school.local" />
                </div>
                <div>
                  <label>Temporary Password</label>
                  <input type="password" value={teacherForm.temporary_password} onChange={(e) => setTeacherForm({ ...teacherForm, temporary_password: e.target.value })} placeholder={teacherEditId ? 'Leave blank to keep current' : 'Temporary password'} />
                </div>
                <div>
                  <label>Account Status</label>
                  <select value={teacherForm.account_status} onChange={(e) => setTeacherForm({ ...teacherForm, account_status: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <label className="checkbox-field" style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" checked={teacherForm.must_change_password} onChange={(e) => setTeacherForm({ ...teacherForm, must_change_password: e.target.checked })} />
                Require password change on first login
              </label>
            </div>

            {error && <div className="error-box full-span">{error}</div>}

            <div className="form-actions full-span">
              <button type="button" className="secondary-btn" onClick={() => {
                setTeacherFormOpen(false);
                setTeacherEditId(null);
                setTeacherForm(initialTeacherForm);
              }}>Cancel</button>
              <button type="submit" className="primary-action-btn" disabled={teacherLoading}>
                {teacherLoading ? 'Saving...' : teacherEditId ? 'Update Teacher' : 'Save Teacher'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel student-toolbar-panel">
        <div className="student-toolbar">
          <div className="search-field">
            <span>🔎</span>
            <input
              placeholder="Search teachers..."
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
            />
          </div>
          <select value={teacherClassFilter} onChange={(e) => setTeacherClassFilter(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
          </select>
          <select value={teacherStatusFilter} onChange={(e) => setTeacherStatusFilter(e.target.value as 'all' | 'Active' | 'Inactive')}>
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="student-workspace">
        <div className="panel student-list-panel">
          <div className="table-header-row">
            <h4>Teacher Directory</h4>
            <span>{filteredTeachers.length} teacher{filteredTeachers.length === 1 ? '' : 's'}</span>
          </div>

          {filteredTeachers.length === 0 ? (
            <div className="empty-state">
              <h5>No teachers found.</h5>
              <p>No teachers match your search or filters.</p>
              <button type="button" className="primary-action-btn" onClick={() => {
                setTeacherFormOpen(true);
                setTeacherEditId(null);
                setTeacherForm(initialTeacherForm);
              }}>+ Add Teacher</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Teacher ID</th>
                    <th>Subject</th>
                    <th>Classes</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td>
                        <div className="student-name-cell">
                          <div className="avatar-circle">{teacher.name.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'T'}</div>
                          <div>
                            <strong>{teacher.name}</strong>
                            <small>{teacher.phone_number}</small>
                          </div>
                        </div>
                      </td>
                      <td>{teacher.teacher_id || '—'}</td>
                      <td>{teacher.subject}</td>
                      <td>{teacher.assigned_class_names?.slice(0, 2).join(', ') || '—'}{(teacher.assigned_class_names?.length || 0) > 2 ? ` +${teacher.assigned_class_names!.length - 2}` : ''}</td>
                      <td>
                        <span className={`status-badge ${teacher.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                          {teacher.status}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="small-action-btn" onClick={() => setTeacherDetailId(teacher.id ?? null)}>View</button>
                          <button type="button" className="small-action-btn" onClick={() => {
                            setTeacherEditId(teacher.id ?? null);
                            setTeacherForm({
                              teacher_id: teacher.teacher_id || '',
                              name: teacher.name,
                              phone_number: teacher.phone_number || '',
                              subject: teacher.subject,
                              status: teacher.status,
                              assigned_classes: teacher.assigned_classes || [],
                              account_username: teacher.account_username || '',
                              account_email: teacher.account_email || '',
                              temporary_password: '',
                              account_status: teacher.account_status === 'Inactive' ? 'Inactive' : 'Active',
                              must_change_password: true,
                            });
                            setTeacherFormOpen(true);
                          }}>Edit</button>
                          <button type="button" className="small-action-btn danger" onClick={() => handleTeacherStatusToggle(teacher)}>
                            {teacher.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedTeacher && (
          <aside className="panel student-detail-panel">
            <div className="detail-header">
              <button type="button" className="back-link" onClick={() => setTeacherDetailId(null)}>← Back to teachers</button>
              <button type="button" className="small-action-btn" onClick={() => {
                setTeacherEditId(selectedTeacher.id ?? null);
                setTeacherForm({
                  teacher_id: selectedTeacher.teacher_id || '',
                  name: selectedTeacher.name,
                  phone_number: selectedTeacher.phone_number || '',
                  subject: selectedTeacher.subject,
                  status: selectedTeacher.status,
                  assigned_classes: selectedTeacher.assigned_classes || [],
                  account_username: selectedTeacher.account_username || '',
                  account_email: selectedTeacher.account_email || '',
                  temporary_password: '',
                  account_status: selectedTeacher.account_status === 'Inactive' ? 'Inactive' : 'Active',
                  must_change_password: true,
                });
                setTeacherFormOpen(true);
              }}>Edit Teacher</button>
            </div>

            <div className="detail-profile">
              <div className="avatar-circle large-avatar">{selectedTeacher.name.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'T'}</div>
              <div>
                <h4>{selectedTeacher.name}</h4>
                <p>Teacher ID: {selectedTeacher.teacher_id || '—'}</p>
                <span className={`status-badge ${selectedTeacher.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                  {selectedTeacher.status}
                </span>
              </div>
            </div>

            <div className="detail-section">
              <h5>Professional Information</h5>
              <div className="detail-grid">
                <div><span>Subject</span><strong>{selectedTeacher.subject}</strong></div>
                <div><span>Phone</span><strong>{selectedTeacher.phone_number || '—'}</strong></div>
              </div>
            </div>

            <div className="detail-section">
              <h5>Account Access</h5>
              <div className="detail-grid">
                <div><span>Status</span><strong>{selectedTeacher.account_status || 'Not created'}</strong></div>
                <div><span>Username</span><strong>{selectedTeacher.account_username || 'No login account'}</strong></div>
              </div>
              <div className="row-actions account-actions">
                <button type="button" className="small-action-btn" onClick={() => {
                  setTeacherEditId(selectedTeacher.id ?? null);
                  setTeacherForm({ teacher_id: selectedTeacher.teacher_id || '', name: selectedTeacher.name, phone_number: selectedTeacher.phone_number || '', subject: selectedTeacher.subject, status: selectedTeacher.status, assigned_classes: selectedTeacher.assigned_classes || [], account_username: selectedTeacher.account_username || '', account_email: selectedTeacher.account_email || '', temporary_password: '', account_status: selectedTeacher.account_status === 'Inactive' ? 'Inactive' : 'Active', must_change_password: true });
                  setTeacherFormOpen(true);
                }}>{selectedTeacher.account_username ? 'Manage Account' : 'Create Teacher Account'}</button>
                {selectedTeacher.account_username && <button type="button" className="small-action-btn" disabled={accountLoading} onClick={() => handleTeacherPasswordReset(selectedTeacher)}>Reset Password</button>}
              </div>
            </div>

            <div className="detail-section">
              <h5>Assigned Classes</h5>
              <div className="detail-grid">
                {(selectedTeacher.assigned_class_names || []).length === 0 ? (
                  <div className="full-width"><span>No classes assigned</span><strong>—</strong></div>
                ) : (
                  (selectedTeacher.assigned_class_names || []).map((className) => (
                    <div key={className}><span>Class</span><strong>{className}</strong></div>
                  ))
                )}
              </div>
            </div>
          </aside>
        )}
      </section>
    </>
  );

  const filteredClasses = classes
    .filter((item) => {
      const query = classSearch.trim().toLowerCase();
      const matchesSearch = !query || [item.name, item.grade || '', item.academic_year || ''].some((value) => value.toLowerCase().includes(query));
      const matchesGrade = classGradeFilter === 'all' || item.grade === classGradeFilter;
      const matchesStatus = classStatusFilter === 'all' || item.status === classStatusFilter;
      return matchesSearch && matchesGrade && matchesStatus;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const selectedClassDetail = classDetailId ? classes.find((item) => item.id === classDetailId) ?? null : null;

  const renderClasses = () => (
    <>
      <header className="student-page-header">
        <div>
          <span className="page-kicker">Classes</span>
          <h3>Classes</h3>
          <p>Manage school classes and class assignments.</p>
        </div>
        <button
          type="button"
          className="primary-action-btn"
          onClick={() => {
            setClassEditId(null);
            setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
            setClassFormOpen(true);
          }}
        >
          + Add Class
        </button>
      </header>

      {classFormOpen && (
        <section className="panel student-form-panel">
          <div className="panel-header-row">
            <div>
              <span className="panel-kicker">Class Form</span>
              <h4>{classEditId ? 'Edit Class' : 'Create Class'}</h4>
            </div>
            <button type="button" className="secondary-btn" onClick={() => {
              setClassFormOpen(false);
              setClassEditId(null);
              setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
            }}>Close</button>
          </div>

          <form onSubmit={handleClassSubmit} className="student-form-grid">
            <div className="field-group">
              <label>Class Name</label>
              <input value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Grade</label>
              <input value={classForm.grade || ''} onChange={(e) => setClassForm({ ...classForm, grade: e.target.value })} placeholder="Grade 8" />
            </div>
            <div className="field-group">
              <label>Academic Year</label>
              <input value={classForm.academic_year || ''} onChange={(e) => setClassForm({ ...classForm, academic_year: e.target.value })} placeholder="2026" />
            </div>
            <div className="field-group">
              <label>Status</label>
              <select value={classForm.status || 'Active'} onChange={(e) => setClassForm({ ...classForm, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {error && <div className="error-box full-span">{error}</div>}
            <div className="form-actions full-span">
              <button type="button" className="secondary-btn" onClick={() => {
                setClassFormOpen(false);
                setClassEditId(null);
                setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
              }}>Cancel</button>
              <button type="submit" className="primary-action-btn">{classEditId ? 'Update Class' : 'Save Class'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel student-toolbar-panel">
        <div className="student-toolbar">
          <div className="search-field">
            <span>🔎</span>
            <input placeholder="Search classes..." value={classSearch} onChange={(e) => setClassSearch(e.target.value)} />
          </div>
          <select value={classGradeFilter} onChange={(e) => setClassGradeFilter(e.target.value)}>
            <option value="all">All Grades</option>
            {[...new Set(classes.map((item) => item.grade).filter(Boolean))].map((grade) => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
          <select value={classStatusFilter} onChange={(e) => setClassStatusFilter(e.target.value as 'all' | 'Active' | 'Inactive')}>
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="student-workspace">
        <div className="panel student-list-panel">
          <div className="table-header-row">
            <h4>Classes</h4>
            <span>{filteredClasses.length} class{filteredClasses.length === 1 ? '' : 'es'}</span>
          </div>

          {filteredClasses.length === 0 ? (
            <div className="empty-state">
              <h5>No classes found.</h5>
              <p>No classes match your current filters.</p>
              <button type="button" className="primary-action-btn" onClick={() => {
                setClassFormOpen(true);
                setClassEditId(null);
                setClassForm({ name: '', grade: '', academic_year: String(new Date().getFullYear()), status: 'Active' });
              }}>+ Add Class</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Grade</th>
                    <th>Students</th>
                    <th>Teachers</th>
                    <th>Academic Year</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map((item) => (
                    <tr key={item.id}>
                      <td><button type="button" className="link-like-button" onClick={() => setClassDetailId(item.id ?? null)}>{item.name}</button></td>
                      <td>{item.grade || '—'}</td>
                      <td>{item.student_count ?? students.filter((student) => String(student.school_class) === String(item.id)).length}</td>
                      <td>{item.teacher_count ?? teachers.filter((teacher) => teacher.assigned_classes?.includes(item.id ?? 0)).length}</td>
                      <td>{item.academic_year || '—'}</td>
                      <td><span className={`status-badge ${item.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{item.status || 'Active'}</span></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="small-action-btn" onClick={() => {
                            setClassDetailId(item.id ?? null);
                          }}>View</button>
                          <button type="button" className="small-action-btn" onClick={() => {
                            setClassEditId(item.id ?? null);
                            setClassForm({
                              name: item.name,
                              grade: item.grade || '',
                              academic_year: item.academic_year || String(new Date().getFullYear()),
                              status: item.status || 'Active',
                            });
                            setClassFormOpen(true);
                          }}>Edit</button>
                          <button type="button" className="small-action-btn danger" onClick={() => {
                            if (item.status === 'Inactive') {
                              void handleClassStatusToggle(item);
                            } else {
                              confirmAction('Deactivate class', `This class will no longer be available for new assignments, but historical records will be preserved.`, () => { void handleClassStatusToggle(item); });
                            }
                          }}>{item.status === 'Inactive' ? 'Activate' : 'Deactivate'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedClassDetail && (
          <aside className="panel student-detail-panel">
            <div className="detail-header">
              <button type="button" className="back-link" onClick={() => setClassDetailId(null)}>← Back to classes</button>
              <button type="button" className="small-action-btn" onClick={() => {
                setClassEditId(selectedClassDetail.id ?? null);
                setClassForm({
                  name: selectedClassDetail.name,
                  grade: selectedClassDetail.grade || '',
                  academic_year: selectedClassDetail.academic_year || String(new Date().getFullYear()),
                  status: selectedClassDetail.status || 'Active',
                });
                setClassFormOpen(true);
              }}>Edit Class</button>
            </div>

            <div className="detail-profile">
              <div className="avatar-circle large-avatar">{selectedClassDetail.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <h4>{selectedClassDetail.name}</h4>
                <p>{selectedClassDetail.grade || 'Grade'} • {selectedClassDetail.academic_year || 'Academic year'}</p>
                <span className={`status-badge ${selectedClassDetail.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{selectedClassDetail.status || 'Active'}</span>
              </div>
            </div>

            <div className="detail-section">
              <h5>Class Overview</h5>
              <div className="detail-grid">
                <div><span>Students</span><strong>{students.filter((student) => String(student.school_class) === String(selectedClassDetail.id)).length}</strong></div>
                <div><span>Teachers</span><strong>{teachers.filter((teacher) => teacher.assigned_classes?.includes(selectedClassDetail.id ?? 0)).length}</strong></div>
              </div>
            </div>

            <div className="detail-section">
              <h5>Students</h5>
              <ul className="simple-list">
                {students.filter((student) => String(student.school_class) === String(selectedClassDetail.id)).length === 0 ? (
                  <li>No students assigned</li>
                ) : (
                  students.filter((student) => String(student.school_class) === String(selectedClassDetail.id)).map((student) => (
                    <li key={student.id}>{student.name}</li>
                  ))
                )}
              </ul>
            </div>

            <div className="detail-section">
              <h5>Teachers</h5>
              <ul className="simple-list">
                {teachers.filter((teacher) => teacher.assigned_classes?.includes(selectedClassDetail.id ?? 0)).length === 0 ? (
                  <li>No teachers assigned</li>
                ) : (
                  teachers.filter((teacher) => teacher.assigned_classes?.includes(selectedClassDetail.id ?? 0)).map((teacher) => (
                    <li key={teacher.id}>{teacher.name}</li>
                  ))
                )}
              </ul>
            </div>
          </aside>
        )}
      </section>
    </>
  );

  const teacherAssignedClassNames = teacherDashboard?.assigned_classes || [];
  const teacherAssignedClassIds = teacherDashboard?.assigned_class_ids && teacherDashboard.assigned_class_ids.length > 0
    ? teacherDashboard.assigned_class_ids
    : classes
        .filter((classItem) => teacherAssignedClassNames.includes(classItem.name))
        .map((classItem) => Number(classItem.id));
  const teacherStudents = students.filter((student) => teacherAssignedClassIds.includes(Number(student.school_class ?? 0)));
  const todaysDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todaysTimetable = teacherDashboard?.today_timetable && teacherDashboard.today_timetable.length > 0
    ? teacherDashboard.today_timetable
    : timetable.filter((item) => item.day === todaysDay && teacherAssignedClassIds.includes(Number(item.school_class ?? 0)));
  const teacherAttendance = attendance.filter((item) => teacherStudents.some((student) => student.id === item.student));

  const renderTeacherDashboard = () => {
    const summary = teacherDashboard?.attendance_summary;
    const selectedTeacherClass = teacherDashboard?.assigned_classes_detail?.find((item) => item.id === teacherClassId);
    if (teacherDashboardLoading) return <section className="teacher-dashboard-loading"><div className="loading-spinner" /><h3>Loading your dashboard...</h3><p>Fetching the latest assigned classes, timetable, attendance, and results.</p></section>;
    return <>
      <header className="topbar dashboard-header teacher-dashboard-header"><div><span className="page-kicker">Teacher workspace · {formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</span><h3>Welcome, {teacherDashboard?.teacher_name || user.username}</h3><p>{teacherDashboard?.subject || 'Assigned subject'} · Your classes and daily work in one place.</p></div><button type="button" className="secondary-btn" onClick={loadTeacherDashboard}>Refresh</button></header>
      <section className="cards teacher-summary-cards"><button type="button" className="stat-card click-card" onClick={() => setActiveSection('classes')}><span>My Classes</span><strong>{teacherDashboard?.assigned_classes_detail?.length ?? 0}</strong><small>Assigned classes</small></button><button type="button" className="stat-card click-card" onClick={() => setActiveSection('attendance')}><span>My Students</span><strong>{teacherDashboard?.student_count ?? 0}</strong><small>Active students</small></button><button type="button" className="stat-card click-card" onClick={() => setActiveSection('attendance')}><span>Attendance Today</span><strong>{summary?.attendance_percentage ?? 0}%</strong><small>{summary?.present ?? 0} present · {summary?.absent ?? 0} absent</small></button><button type="button" className="stat-card click-card" onClick={() => setActiveSection('exams')}><span>Pending Results</span><strong>{teacherDashboard?.pending_result_count ?? 0}</strong><small>Subjects needing entry</small></button><button type="button" className="stat-card click-card" onClick={() => setActiveSection('timetable')}><span>Today’s Timetable</span><strong>{teacherDashboard?.today_timetable?.length ?? 0}</strong><small>Assigned periods</small></button></section>
      <section className="panel-grid teacher-dashboard-grid"><section className="panel teacher-classes-panel"><div className="section-heading-row"><div><span className="panel-kicker">Assigned to you</span><h4>My Classes</h4></div><button type="button" className="link-button" onClick={() => setActiveSection('classes')}>Open classes</button></div>{(teacherDashboard?.assigned_classes_detail || []).length === 0 ? <p className="empty-text">No classes have been assigned yet.</p> : <div className="teacher-class-list">{teacherDashboard?.assigned_classes_detail?.map((item) => <button type="button" className={`teacher-class-card ${teacherClassId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setTeacherClassId(item.id)}><span className="class-card-title">{item.name}</span><span>{item.student_count} students</span><span>{item.subjects.length ? item.subjects.join(', ') : teacherDashboard?.subject || 'Assigned subject'}</span><span className="class-card-attendance">{item.attendance_marked}/{item.attendance_total} attendance marked</span></button>)}</div>}</section><section className="panel teacher-timetable-panel"><div className="section-heading-row"><div><span className="panel-kicker">Today</span><h4>Timetable</h4></div><button type="button" className="link-button" onClick={() => setActiveSection('timetable')}>Full timetable</button></div>{(teacherDashboard?.today_timetable || []).length === 0 ? <p className="empty-text">No periods are scheduled for today.</p> : <div className="teacher-schedule-list">{teacherDashboard?.today_timetable?.map((item) => <div className="teacher-schedule-item" key={item.id}><strong>{item.start_time} - {item.end_time}</strong><span>{item.subject}</span><small>{item.school_class}</small></div>)}</div>}</section></section>
      {selectedTeacherClass && <section className="panel teacher-class-detail"><div className="section-heading-row"><div><span className="panel-kicker">Class detail</span><h4>{selectedTeacherClass.name}</h4><p>{selectedTeacherClass.grade || 'Class'} · {selectedTeacherClass.academic_year || 'Current academic year'}</p></div><button type="button" className="secondary-btn" onClick={() => setTeacherClassId(null)}>Close</button></div><div className="detail-grid"><div><span>Students</span><strong>{selectedTeacherClass.student_count}</strong></div><div><span>Subjects</span><strong>{selectedTeacherClass.subjects.join(', ') || teacherDashboard?.subject || '—'}</strong></div><div><span>Attendance</span><strong>{selectedTeacherClass.attendance_marked}/{selectedTeacherClass.attendance_total} marked</strong></div></div><div className="quick-actions"><button type="button" onClick={() => setActiveSection('attendance')}>Mark Attendance</button><button type="button" onClick={() => setActiveSection('exams')}>Enter Results</button></div></section>}
      <section className="panel-grid teacher-dashboard-grid"><section className="panel"><div className="section-heading-row"><h4>Pending Results</h4><button type="button" className="link-button" onClick={() => setActiveSection('exams')}>Open results</button></div>{(teacherDashboard?.pending_results || []).length === 0 ? <p className="empty-text">No pending results for your assigned classes.</p> : <div className="pending-result-list">{teacherDashboard?.pending_results?.slice(0, 6).map((item) => <div className="pending-result-item" key={`${item.exam_id}-${item.subject}`}><div><strong>{item.exam_name}</strong><span>{item.class_name} · {item.subject}</span></div><small>{item.completed}/{item.total} entered</small></div>)}</div>}</section><section className="panel"><div className="section-heading-row"><h4>Homework Due Soon</h4><button type="button" className="link-button" onClick={() => setActiveSection('homework')}>View homework</button></div>{(teacherDashboard?.upcoming_homework || []).length === 0 ? <p className="empty-text">No homework is due soon.</p> : <div className="pending-result-list">{teacherDashboard?.upcoming_homework?.map((item) => <div className="pending-result-item" key={`${item.title}-${item.due_date}`}><div><strong>{item.title}</strong><span>{item.school_class} · {item.subject}</span></div><small>{item.due_date}</small></div>)}</div>}</section></section>
      <section className="panel teacher-announcements-panel"><div className="section-heading-row"><h4>Relevant Announcements</h4><button type="button" className="link-button" onClick={() => setActiveSection('announcements')}>View all</button></div>{(teacherDashboard?.relevant_announcements || announcements.slice(0, 4)).length === 0 ? <p className="empty-text">No announcements for you right now.</p> : <div className="teacher-announcement-list">{(teacherDashboard?.relevant_announcements || announcements.slice(0, 4)).map((item) => <article key={item.id || item.title}><strong>{item.title}</strong><p>{item.content}</p><small>{item.audience || 'Everyone'} · {item.created_at ? formatDate(item.created_at) : 'Recently'}</small></article>)}</div>}</section>
    </>;
  };

  const renderTeacherClasses = () => <>
    <header className="topbar teacher-dashboard-header"><div><span className="page-kicker">Teacher workspace</span><h3>My Classes</h3><p>Only classes assigned to you are shown here.</p></div><button type="button" className="secondary-btn" onClick={loadTeacherDashboard}>Refresh</button></header>
    <section className="teacher-class-list teacher-class-page-list">{(teacherDashboard?.assigned_classes_detail || []).map((item) => <article className="panel teacher-class-card-static" key={item.id}><div><span className="page-kicker">{item.grade || 'Class'}</span><h4>{item.name}</h4><p>{item.academic_year || 'Current academic year'}</p></div><div className="detail-grid"><div><span>Students</span><strong>{item.student_count}</strong></div><div><span>Attendance</span><strong>{item.attendance_marked}/{item.attendance_total}</strong></div><div><span>Subjects</span><strong>{item.subjects.join(', ') || teacherDashboard?.subject || '—'}</strong></div></div><div className="quick-actions"><button type="button" onClick={() => { setSelectedClassId(String(item.id)); setActiveSection('attendance'); }}>Mark Attendance</button><button type="button" onClick={() => setActiveSection('exams')}>View Results</button></div></article>)}{(teacherDashboard?.assigned_classes_detail || []).length === 0 && <p className="empty-text">No classes have been assigned yet.</p>}</section>
  </>;

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ report: reportMode });
      if (reportClassFilter !== 'all') params.set('class', reportClassFilter);
      if (reportStudentFilter !== 'all') params.set('student', reportStudentFilter);
      if (reportStatusFilter !== 'all') params.set('status', reportStatusFilter);
      if (reportExamFilter !== 'all') params.set('exam', reportExamFilter);
      if (reportSubjectFilter !== 'all') params.set('subject', reportSubjectFilter);
      if (reportGenderFilter !== 'all') params.set('gender', reportGenderFilter);
      if (reportFrom) params.set('from', reportFrom);
      if (reportTo) params.set('to', reportTo);
      const response = await fetch(`${API_BASE}/reports/?${params.toString()}`, { headers: authHeaders });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Unable to generate report');
      setReportRows(Array.isArray(data) ? data as ReportRow[] : []);
      setReportGeneratedAt(formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' }));
      showToast({ title: 'Report generated', message: `${reportMode === 'summary' ? 'School summary' : reportMode[0].toUpperCase() + reportMode.slice(1)} report is ready.`, variant: 'success' });
    } catch (err) {
      showToast({ title: 'Report failed', message: err instanceof Error ? err.message : 'Unable to generate report', variant: 'error' });
    } finally {
      setReportLoading(false);
    }
  };

  const renderReports = () => {
    const columns: Record<string, string[]> = {
      students: ['student_id', 'name', 'father_name', 'class_name', 'contact_number', 'status'],
      attendance: ['date', 'student_id', 'student_name', 'class_name', 'status'],
      results: ['student_id', 'student_name', 'exam_name', 'class_name', 'subject', 'marks', 'maximum', 'percentage', 'grade'],
      fees: ['student_id', 'student_name', 'class_name', 'fee_type', 'total_due', 'paid', 'remaining', 'due_date', 'status'],
      teachers: ['name', 'subject', 'classes', 'class_count', 'status'],
    };
    const labels = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const activeColumns = columns[reportMode] || [];
    const reportTitles: Record<string, string> = { summary: 'School Summary', students: 'Student List', attendance: 'Attendance Report', results: 'Examination Results', fees: 'Fee Ledger', teachers: 'Teacher Report' };
    return <div className="printable-report">
      <header className="topbar"><div><span className="page-kicker">School management</span><h3>Reports</h3><p>View and generate school management reports.</p></div><button type="button" className="secondary-btn print-btn" onClick={() => window.print()}>Print</button></header><section className="report-intro"><div><h4>{reportTitles[reportMode]}</h4><p>Live database data for the selected report.{reportGeneratedAt && ` Generated ${reportGeneratedAt}.`}</p></div><span className="report-live-badge">Updated from school records</span></section>
      <section className="panel report-controls"><div className="report-control-grid"><div className="field-group"><label>Report</label><select value={reportMode} onChange={(e) => { setReportMode(e.target.value); setReportRows([]); setReportGeneratedAt(''); }}><option value="summary">School Summary</option><option value="students">Student List</option><option value="attendance">Attendance</option><option value="results">Examination Results</option><option value="fees">Fee Ledger</option><option value="teachers">Teacher Report</option></select></div>{!['summary', 'teachers'].includes(reportMode) && <div className="field-group"><label>Class</label><select value={reportClassFilter} onChange={(e) => setReportClassFilter(e.target.value)}><option value="all">All Classes</option>{classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></div>}{['attendance', 'fees'].includes(reportMode) && <div className="field-group"><label>Student</label><select value={reportStudentFilter} onChange={(e) => setReportStudentFilter(e.target.value)}><option value="all">All Students</option>{students.map((student) => <option key={student.id} value={String(student.id)}>{student.name} ({student.student_id})</option>)}</select></div>}{reportMode === 'students' && <div className="field-group"><label>Gender</label><select value={reportGenderFilter} onChange={(e) => setReportGenderFilter(e.target.value)}><option value="all">All Genders</option><option>Male</option><option>Female</option></select></div>}{['attendance', 'fees'].includes(reportMode) && <div className="field-group"><label>Status</label><select value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)}><option value="all">All Statuses</option>{(reportMode === 'attendance' ? ['Present', 'Absent', 'Late'] : ['Paid', 'Partially Paid', 'Pending']).map((status) => <option key={status}>{status}</option>)}</select></div>}{reportMode === 'results' && <><div className="field-group"><label>Examination</label><select value={reportExamFilter} onChange={(e) => setReportExamFilter(e.target.value)}><option value="all">All Examinations</option>{exams.map((exam) => <option key={exam.id} value={String(exam.id)}>{exam.name}</option>)}</select></div><div className="field-group"><label>Subject</label><select value={reportSubjectFilter} onChange={(e) => setReportSubjectFilter(e.target.value)}><option value="all">All Subjects</option>{[...new Set(exams.flatMap((exam) => exam.subjects?.length ? exam.subjects : [exam.subject]).filter(Boolean))].map((subject) => <option key={subject}>{subject}</option>)}</select></div></>}{reportMode === 'attendance' && <><div className="field-group"><label>From</label><input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></div><div className="field-group"><label>To</label><input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></div></>}<div className="field-group report-control-action"><button type="button" className="primary-action-btn" onClick={generateReport} disabled={reportLoading}>{reportLoading ? 'Generating...' : 'Generate Report'}</button></div></div></section>
      {reportMode === 'summary' ? <><section className="cards"><div className="stat-card"><span>Total Students</span><strong>{reports?.student_count ?? 0}</strong></div><div className="stat-card"><span>Total Teachers</span><strong>{reports?.teacher_count ?? 0}</strong></div><div className="stat-card"><span>Attendance Rate</span><strong>{reports?.attendance_rate ?? 0}%</strong></div><div className="stat-card"><span>Pending Fees</span><strong>{reports?.fee_summary?.pending ?? 0}</strong></div></section><section className="panel-grid"><div className="panel"><h4>Fee Summary</h4><ul className="simple-list"><li>Paid: {reports?.fee_summary?.paid ?? 0}</li><li>Partially Paid: {reports?.fee_summary?.partially_paid ?? 0}</li><li>Pending: {reports?.fee_summary?.pending ?? 0}</li></ul></div><div className="panel"><h4>Class Distribution</h4><ul className="simple-list">{(reports?.class_summary || []).map((item) => <li key={item.name}>{item.name}: {item.student_count} students</li>)}</ul></div></section></> : <section className="panel table-panel"><div className="table-header-row"><div><span className="panel-kicker">Generated report</span><h4>{labels(reportMode)}</h4></div><span className="muted-count">{reportRows.length} records</span></div>{reportRows.length ? <div className="table-wrap"><table><thead><tr>{activeColumns.map((column) => <th key={column}>{labels(column)}</th>)}</tr></thead><tbody>{reportRows.map((row, index) => <tr key={index}>{activeColumns.map((column) => <td key={column}>{Array.isArray(row[column]) ? row[column].join(', ') : String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <p className="empty-text">Choose filters and generate a report.</p>}</section>}
    </div>;
  };

  const renderSettings = () => (
    <>
      <header className="student-page-header">
        <div>
          <span className="page-kicker">Administration</span>
          <h3>Settings</h3>
          <p>Keep the school identity and academic year up to date.</p>
        </div>
      </header>
      <section className="panel form-panel">
        <h4>School Information</h4>
        <form onSubmit={handleSettingsSubmit} className="student-form-grid">
          <div className="field-group"><label>School Name</label><input value={settings.school_name} onChange={(e) => setSettings({ ...settings, school_name: e.target.value })} required /></div>
          <div className="field-group"><label>Phone</label><input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></div>
          <div className="field-group"><label>Academic Year</label><input value={settings.academic_year} onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })} required /></div>
          <div className="field-group"><label>School Logo</label><input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} /></div>
          <div className="field-group full-span"><label>Address</label><textarea value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></div>
          <div className="form-actions full-span"><button type="submit" className="primary-action-btn" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button></div>
        </form>
      </section>
      <section className="panel form-panel profile-settings-panel">
        <div className="settings-section-heading"><div><span className="page-kicker">Account</span><h4>Admin Profile</h4><p>Manage your identity and security details.</p></div><div className="profile-avatar-large">{(user.first_name?.[0] || user.username[0] || 'A').toUpperCase()}</div></div>
        <form onSubmit={handleProfileSubmit} className="student-form-grid">
          <div className="field-group"><label>First Name</label><input value={profileForm?.first_name || user.first_name || ''} onFocus={() => !profileForm && setProfileForm(user)} onChange={(e) => setProfileForm({ ...(profileForm || user), first_name: e.target.value })} /></div>
          <div className="field-group"><label>Last Name</label><input value={profileForm?.last_name || user.last_name || ''} onFocus={() => !profileForm && setProfileForm(user)} onChange={(e) => setProfileForm({ ...(profileForm || user), last_name: e.target.value })} /></div>
          <div className="field-group"><label>Username</label><input value={profileForm?.username || user.username} onFocus={() => !profileForm && setProfileForm(user)} onChange={(e) => setProfileForm({ ...(profileForm || user), username: e.target.value })} required /></div>
          <div className="field-group"><label>Email Address</label><input type="email" value={profileForm?.email || user.email} onFocus={() => !profileForm && setProfileForm(user)} onChange={(e) => setProfileForm({ ...(profileForm || user), email: e.target.value })} /></div>
          <div className="field-group"><label>Role</label><input value={user.role === 'admin' ? 'Admin' : 'Teacher'} readOnly /></div>
          <div className="field-group"><label>Account Status</label><input value={user.is_active === false ? 'Inactive' : 'Active'} readOnly /></div>
          <div className="field-group"><label>Last Login</label><input value={user.last_login ? formatDate(user.last_login, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'} readOnly /></div>
          <div className="form-actions full-span"><button type="submit" className="primary-action-btn" disabled={profileLoading}>{profileLoading ? 'Saving...' : 'Save Profile'}</button><button type="button" className="secondary-btn" onClick={() => { handleLogout(); showToast({ title: 'Signed out', message: 'Your access and refresh credentials were removed from this device.', variant: 'success' }); }}>Logout</button><button type="button" className="secondary-btn danger-outline" onClick={() => confirmAction('Logout from all devices', 'Every active session for this account will be revoked.', handleLogoutAll)}>Logout All Devices</button></div>
        </form>
        <form className="password-change-form" onSubmit={handleChangePassword}><h5>Password</h5><div className="profile-password-grid"><input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /><input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /><button type="submit" className="secondary-btn">Change Password</button></div></form>
        <div className="profile-activity"><h5>Activity Summary</h5><div className="profile-activity-grid"><span><strong>{announcements.length}</strong>Announcements</span><span><strong>{exams.length}</strong>Exams</span><span><strong>{fees.length}</strong>Fee records</span><span><strong>{reports?.result_count ?? results.length}</strong>Results tracked</span></div></div>
      </section>
    </>
  );

  const selectedClassStudents = students.filter((student) => {
    const currentClass = student.school_class ?? '';
    return String(currentClass) === String(selectedClassId);
  });

  const recentAttendance = (user?.role === 'teacher' ? teacherAttendance : attendance)
    .filter((item) => {
      const classMatches = attendanceClassFilter === 'all' || String(item.school_class ?? '') === attendanceClassFilter;
      const recordTeacher = teachers.find((teacher) => {
        const candidateIds = [teacher.user, teacher.id];
        return candidateIds.some((candidate) => Number(candidate ?? 0) === Number(item.recorded_by ?? 0));
      });
      const teacherMatches = attendanceTeacherFilter === 'all' || String(recordTeacher?.id ?? '') === attendanceTeacherFilter;
      return classMatches && teacherMatches;
    })
    .slice(0, 12);

  const renderAttendance = () => (
    <>
      <header className="topbar"><h3>{user?.role === 'teacher' ? 'Attendance Overview' : 'Attendance'}</h3></header>

      <section className="panel form-panel attendance-panel">
        <h4>{user?.role === 'teacher' ? 'Mark Attendance by Class' : 'Mark Attendance by Class'}</h4>
        <form onSubmit={handleAttendanceSubmit} className="attendance-form">
          <div className="attendance-toolbar">
            <select value={selectedClassId} onChange={(e) => {
              setSelectedClassId(e.target.value);
              setAttendanceByStudent({});
            }}>
              <option value="">Select class</option>
              {(user?.role === 'teacher' ? classes.filter((classItem) => teacherAssignedClassNames.includes(classItem.name)) : classes).map((item) => (
                <option key={item.id} value={String(item.id)}>{item.name}</option>
              ))}
            </select>
            <input type="date" value={attendanceForm.attendance_date} onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_date: e.target.value })} />
            <button type="submit" className="save-attendance-btn">Save Class Attendance</button>
          </div>
        </form>

        {selectedClassId && (
          <div className="attendance-list">
            {selectedClassStudents.length === 0 ? (
              <p>No students found in this class.</p>
            ) : (
              selectedClassStudents.map((student) => (
                <div key={student.id} className="attendance-item">
                  <span>{student.name}</span>
                  <div className="status-buttons">
                    {['Present', 'Absent', 'Late'].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={attendanceByStudent[student.id ?? 0] === status ? 'active-status' : ''}
                        onClick={() => setAttendanceByStudent((current) => ({ ...current, [student.id ?? 0]: status }))}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="panel table-panel attendance-report-panel">
        <div className="attendance-report-header">
          <h4>Recent Attendance</h4>
          <div className="attendance-filters">
            <select value={attendanceClassFilter} onChange={(e) => setAttendanceClassFilter(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
            </select>
            <select value={attendanceTeacherFilter} onChange={(e) => setAttendanceTeacherFilter(e.target.value)}>
              <option value="all">All Teachers</option>
              {teachers.map((teacher) => <option key={teacher.id} value={String(teacher.id)}>{teacher.name}</option>)}
            </select>
          </div>
        </div>

        <div className="attendance-summary-strip">
          <div className="attendance-summary-box present-box"><span>Present</span><strong>{recentAttendance.filter((item) => item.status === 'Present').length}</strong></div>
          <div className="attendance-summary-box absent-box"><span>Absent</span><strong>{recentAttendance.filter((item) => item.status === 'Absent').length}</strong></div>
          <div className="attendance-summary-box late-box"><span>Late</span><strong>{recentAttendance.filter((item) => item.status === 'Late').length}</strong></div>
        </div>

        <table>
          <thead><tr><th>Student</th><th>Class</th><th>Date</th><th>Status</th><th>Recorded By</th></tr></thead>
          <tbody>
            {recentAttendance.length > 0 ? recentAttendance.map((item) => (
              <tr key={item.id}>
                <td>{item.student_name}</td>
                <td>{classes.find((classItem) => String(classItem.id) === String(item.school_class))?.name || item.school_class_name || 'Unassigned'}</td>
                <td>{item.attendance_date}</td>
                <td>
                  <span className={`status-badge attendance-status ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </td>
                <td>{item.recorded_by_name || '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}><p className="empty-text">No attendance matches the selected class and teacher filters.</p></td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );

  const renderTimetable = () => {
    const sourceTimetable = user?.role === 'teacher' ? todaysTimetable : timetable;
    const filteredTimetable = sourceTimetable.filter((item) => {
      const matchesClass = timetableClassFilter === 'all' || String(item.school_class) === timetableClassFilter;
      const matchesTeacher = timetableTeacherFilter === 'all' || String(item.teacher) === timetableTeacherFilter;
      return matchesClass && matchesTeacher;
    });

    return (
      <div className="printable-timetable-area">
        <header className="topbar timetable-header">
          <h3>{user?.role === 'teacher' ? "Today's Timetable" : 'Timetable'}</h3>
          {user?.role !== 'teacher' && (
            <div className="timetable-header-actions">
              <button type="button" className="print-btn" onClick={() => window.print()}>Print / Download</button>
            </div>
          )}
        </header>

        {user?.role !== 'teacher' && (
          <section className="panel form-panel">
            <h4>Add Timetable Entry</h4>
            <form onSubmit={handleTimetableSubmit} className="student-form">
              <select value={timetableForm.day} onChange={(e) => setTimetableForm({ ...timetableForm, day: e.target.value })}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select value={String(timetableForm.school_class ?? '')} onChange={(e) => setTimetableForm({ ...timetableForm, school_class: e.target.value })}>
                <option value="">Select class</option>
                {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
              </select>
              <select value={String(timetableForm.teacher ?? '')} onChange={(e) => setTimetableForm({ ...timetableForm, teacher: e.target.value })}>
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (<option key={teacher.id} value={String(teacher.id)}>{teacher.name} - {teacher.subject}</option>))}
              </select>
              <input type="text" value={timetableForm.subject} placeholder="Subject" onChange={(e) => setTimetableForm({ ...timetableForm, subject: e.target.value })} />
              <input type="time" value={timetableForm.start_time} onChange={(e) => setTimetableForm({ ...timetableForm, start_time: e.target.value })} />
              <input type="time" value={timetableForm.end_time} onChange={(e) => setTimetableForm({ ...timetableForm, end_time: e.target.value })} />
              <button type="submit">Save Entry</button>
            </form>
          </section>
        )}

        <section className="panel table-panel timetable-filter-panel">
          <div className="timetable-filter-row">
            <div className="filter-field">
              <label>Class</label>
              <select value={timetableClassFilter} onChange={(e) => setTimetableClassFilter(e.target.value)}>
                <option value="all">All Classes</option>
                {classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
              </select>
            </div>
            <div className="filter-field">
              <label>Teacher</label>
              <select value={timetableTeacherFilter} onChange={(e) => setTimetableTeacherFilter(e.target.value)}>
                <option value="all">All Teachers</option>
                {teachers.map((teacher) => <option key={teacher.id} value={String(teacher.id)}>{teacher.name}</option>)}
              </select>
            </div>
            <button type="button" className="secondary-btn print-btn" onClick={() => window.print()}>Print / Download</button>
          </div>
        </section>

        <section className="panel table-panel timetable-table-panel timetable-print-sheet">
          <h4>{user?.role === 'teacher' ? `Schedule for ${todaysDay}` : 'Schedule'}</h4>
          <table>
            <thead><tr><th>Day</th><th>Class</th><th>Teacher</th><th>Subject</th><th>Time</th>{user?.role !== 'teacher' && <th>Actions</th>}</tr></thead>
            <tbody>
              {filteredTimetable.map((item) => (
                <tr key={item.id}>
                  <td>{item.day}</td>
                  <td>{classes.find((classItem) => String(classItem.id) === String(item.school_class))?.name || item.school_class}</td>
                  <td>{teachers.find((teacher) => String(teacher.id) === String(item.teacher))?.name || item.teacher}</td>
                  <td>{item.subject}</td>
                  <td>{item.start_time} - {item.end_time}</td>
                  {user?.role !== 'teacher' && <td><button type="button" className="small-action-btn danger" onClick={() => confirmAction('Delete timetable entry', 'This schedule entry will be removed.', () => handleDeleteResource('timetable', item.id))}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTimetable.length === 0 && (
            <p className="empty-text">No timetable entries match the selected class and teacher filters.</p>
          )}
        </section>
      </div>
    );
  };

  const renderExamsRedesigned = () => {
    void handleResultSubmit;
    const selectedClass = classes.find((item) => String(item.id) === String(examForm.school_class));
    const subjectOptions = selectedClass?.available_subjects || selectedClass?.subjects || [];
    const getSubjects = (exam: ExamType) => exam.subjects?.length ? exam.subjects : [exam.subject];
    const getClass = (exam: ExamType) => classes.find((item) => String(item.id) === String(exam.school_class));
    const getProgress = (exam: ExamType) => {
      const classStudents = students.filter((student) => String(student.school_class) === String(exam.school_class) && student.is_active !== false);
      const subjects = getSubjects(exam);
      const completed = subjects.filter((subject) => classStudents.length > 0 && classStudents.every((student) => results.some((result) => result.exam === exam.id && result.student === student.id && result.subject === subject))).length;
      return { completed, total: subjects.length, students: classStudents };
    };
    const getStatus = (exam: ExamType) => {
      const progress = getProgress(exam);
      const today = new Date().toISOString().slice(0, 10);
      if (progress.total > 0 && progress.completed === progress.total) return 'Completed';
      if ((exam.start_date || exam.exam_date) > today) return 'Scheduled';
      if ((exam.end_date || exam.exam_date) >= today) return 'Active';
      return 'Draft';
    };
    const visibleExams = exams.filter((exam) => {
      const text = `${exam.name} ${getClass(exam)?.name || ''}`.toLowerCase();
      return (!examSearch.trim() || text.includes(examSearch.trim().toLowerCase())) && (examClassFilter === 'all' || String(exam.school_class) === examClassFilter) && (examTypeFilter === 'all' || exam.exam_type === examTypeFilter) && (examYearFilter === 'all' || String(exam.academic_year) === examYearFilter) && (examStatusFilter === 'all' || getStatus(exam) === examStatusFilter);
    });
    const selectedExam = exams.find((exam) => exam.id === selectedExamId);
    const selectedProgress = selectedExam ? getProgress(selectedExam) : null;

    if (examView === 'details' && selectedExam) {
      return <div className="modal-backdrop"><section className="panel exam-results-modal"><div className="modal-header"><div><span className="page-kicker">Exam details</span><h3>{selectedExam.name}</h3><p>{getClass(selectedExam)?.name || 'Class'}</p></div><button type="button" className="secondary-btn" onClick={() => setExamView('list')}>Close</button></div><div className="exam-detail-grid"><div><span>Exam type</span><strong>{selectedExam.exam_type || '—'}</strong></div><div><span>Academic year</span><strong>{selectedExam.academic_year || '—'}</strong></div><div><span>Subjects</span><strong>{getSubjects(selectedExam).join(', ') || '—'}</strong></div><div><span>Maximum marks</span><strong>{selectedExam.max_marks || 100}</strong></div><div><span>Dates</span><strong>{selectedExam.start_date || selectedExam.exam_date} to {selectedExam.end_date || selectedExam.exam_date}</strong></div><div><span>Results progress</span><strong>{selectedProgress?.completed}/{selectedProgress?.total} subjects</strong></div></div></section></div>;
    }

    if (examView === 'entry' && selectedExam && selectedProgress) {
      const subjects = getSubjects(selectedExam);
      return <section className="exam-workspace"><button type="button" className="back-link" onClick={() => setExamView('list')}>← Back to Exams</button><header className="workspace-header"><div><span className="page-kicker">Class result entry</span><h3>Enter Results</h3><p>{selectedExam.name} · {getClass(selectedExam)?.name || 'Class'}</p></div><span className="workspace-count">{selectedProgress.students.length} students</span></header><section className="panel result-entry-panel"><div className="result-entry-controls"><div><label>Subject</label><select value={resultEntrySubject} onChange={(e) => setResultEntrySubject(e.target.value)}><option value="">Select subject</option>{subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></div><div><label>Maximum Marks</label><input type="number" min="1" value={resultEntryMaxMarks} onChange={(e) => setResultEntryMaxMarks(Number(e.target.value))} /></div></div><form onSubmit={(event) => handleBulkResultSubmit(event, selectedExam, selectedProgress.students)}><table><thead><tr><th>Student</th><th>Student ID</th><th>Marks</th><th>Percentage</th></tr></thead><tbody>{selectedProgress.students.map((student) => { const value = resultEntryMarks[student.id ?? 0] || ''; const percentage = value === '' ? '—' : `${((Number(value) / resultEntryMaxMarks) * 100).toFixed(2)}%`; return <tr key={student.id}><td>{student.name}</td><td>{student.student_id}</td><td><input className="marks-input" type="number" min="0" max={resultEntryMaxMarks} value={value} onChange={(e) => setResultEntryMarks((current) => ({ ...current, [student.id ?? 0]: e.target.value }))} /></td><td>{percentage}</td></tr>; })}</tbody></table>{selectedProgress.students.length === 0 && <p className="empty-text">No active students are assigned to this class.</p>}<div className="sticky-result-actions"><span>{Object.values(resultEntryMarks).filter(Boolean).length} entered</span><button type="button" className="secondary-btn" onClick={() => setExamView('list')}>Cancel</button><button type="submit" className="primary-btn" disabled={resultSaving}>{resultSaving ? 'Saving Results...' : 'Save Results'}</button></div></form></section></section>;
    }

    if (examView === 'results' && selectedExam) {
      const rows = results.filter((result) => result.exam === selectedExam.id && (resultSubjectFilter === 'all' || result.subject === resultSubjectFilter) && (!resultSearch.trim() || `${result.student_name || ''} ${students.find((student) => student.id === result.student)?.student_id || ''}`.toLowerCase().includes(resultSearch.trim().toLowerCase())));
      return <div className="modal-backdrop"><section className="panel exam-results-modal"><div className="modal-header"><div><span className="page-kicker">Result review</span><h3>{selectedExam.name}</h3><p>{getClass(selectedExam)?.name || 'Class'}</p></div><button type="button" className="secondary-btn" onClick={() => setExamView('list')}>Close</button></div><div className="result-filter-row"><div className="search-field"><span>🔎</span><input placeholder="Search student..." value={resultSearch} onChange={(e) => setResultSearch(e.target.value)} /></div><select value={resultSubjectFilter} onChange={(e) => setResultSubjectFilter(e.target.value)}><option value="all">All Subjects</option>{getSubjects(selectedExam).map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>Student</th><th>Student ID</th><th>Subject</th><th>Marks</th><th>Percentage</th><th>Grade</th></tr></thead><tbody>{rows.map((result) => <tr key={result.id}><td>{result.student_name || students.find((student) => student.id === result.student)?.name || '—'}</td><td>{students.find((student) => student.id === result.student)?.student_id || '—'}</td><td>{result.subject}</td><td>{result.marks}/{result.total_marks}</td><td>{result.percentage}%</td><td>{result.grade}</td></tr>)}</tbody></table></div>{rows.length === 0 && <p className="empty-text">No results have been entered yet.</p>}</section></div>;
    }

    const pendingResults = exams.filter((exam) => getStatus(exam) !== 'Completed').length;
    return <><header className="topbar exam-page-header"><div><span className="page-kicker">Academic records</span><h3>Exams & Results</h3><p>Find an exam, then enter or review class results.</p></div><button type="button" className="primary-action-btn" onClick={() => { setExamForm(initialExam); setExamModalOpen(true); }}>+ Create Examination</button></header><section className="cards exam-summary-cards"><div className="stat-card"><span>Total Exams</span><strong>{exams.length}</strong></div><div className="stat-card"><span>Active Exams</span><strong>{exams.filter((exam) => getStatus(exam) === 'Active').length}</strong></div><div className="stat-card"><span>Completed Exams</span><strong>{exams.filter((exam) => getStatus(exam) === 'Completed').length}</strong></div><div className="stat-card"><span>Pending Results</span><strong>{pendingResults}</strong></div></section><section className="panel student-toolbar-panel exam-filter-panel"><div className="student-toolbar"><div className="search-field"><span>🔎</span><input placeholder="Search exam or class..." value={examSearch} onChange={(e) => setExamSearch(e.target.value)} /></div><select value={examYearFilter} onChange={(e) => setExamYearFilter(e.target.value)}><option value="all">All Academic Years</option>{[...new Set(exams.map((exam) => exam.academic_year).filter(Boolean))].map((year) => <option key={year} value={String(year)}>{year}</option>)}</select><select value={examClassFilter} onChange={(e) => setExamClassFilter(e.target.value)}><option value="all">All Classes</option>{classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select><select value={examTypeFilter} onChange={(e) => setExamTypeFilter(e.target.value)}><option value="all">All Exam Types</option>{[...new Set(exams.map((exam) => exam.exam_type).filter(Boolean))].map((type) => <option key={type} value={type}>{type}</option>)}</select><select value={examStatusFilter} onChange={(e) => setExamStatusFilter(e.target.value)}><option value="all">All Status</option><option>Draft</option><option>Scheduled</option><option>Active</option><option>Completed</option></select></div></section><section className="panel table-panel exam-list-panel"><div className="table-header-row"><div><span className="panel-kicker">Exam list</span><h4>Examinations</h4></div><span className="muted-count">{visibleExams.length} found</span></div><div className="table-wrap"><table><thead><tr><th>Exam Name</th><th>Class</th><th>Subject(s)</th><th>Type</th><th>Academic Year</th><th>Dates</th><th>Status</th><th>Results Progress</th><th>Actions</th></tr></thead><tbody>{visibleExams.map((exam) => { const progress = getProgress(exam); const status = getStatus(exam); return <tr key={exam.id}><td><strong>{exam.name}</strong></td><td>{getClass(exam)?.name || '—'}</td><td>{getSubjects(exam).join(', ') || '—'}</td><td>{exam.exam_type || '—'}</td><td>{exam.academic_year || '—'}</td><td>{exam.start_date || exam.exam_date} → {exam.end_date || exam.exam_date}</td><td><span className={`status-badge exam-status-${status.toLowerCase()}`}>{status}</span></td><td><strong>{progress.completed}/{progress.total}</strong> subjects</td><td className="exam-actions-cell"><button type="button" className="small-action-btn" onClick={() => setExamActionMenuId((current) => current === exam.id ? null : exam.id ?? null)}>Actions ⋮</button>{examActionMenuId === exam.id && <div className="action-menu exam-action-menu"><button type="button" className="menu-item" onClick={() => { setSelectedExamId(exam.id ?? null); setExamView('details'); setExamActionMenuId(null); }}>View Exam</button><button type="button" className="menu-item" onClick={() => { setSelectedExamId(exam.id ?? null); setResultEntrySubject(getSubjects(exam)[0] || ''); setResultEntryMaxMarks(exam.max_marks || 100); setExamView('entry'); setExamActionMenuId(null); }}>Enter Results</button><button type="button" className="menu-item" onClick={() => { setSelectedExamId(exam.id ?? null); setResultSubjectFilter('all'); setResultSearch(''); setExamView('results'); setExamActionMenuId(null); }}>View Results</button><button type="button" className="menu-item" onClick={() => { setExamForm(exam); setExamModalOpen(true); setExamActionMenuId(null); }}>Edit Exam</button><button type="button" className="menu-item danger" onClick={() => { confirmAction('Delete exam', 'This exam and its results will be removed.', () => handleDeleteResource('exams', exam.id)); setExamActionMenuId(null); }}>Delete Exam</button></div>}</td></tr>; })}</tbody></table></div>{visibleExams.length === 0 && <div className="empty-state"><h5>No examinations found.</h5><p>Create your first examination to get started.</p><button type="button" className="primary-btn" onClick={() => setExamModalOpen(true)}>+ Create Exam</button></div>}</section>{examModalOpen && <div className="modal-backdrop"><section className="panel exam-modal"><div className="modal-header"><div><span className="page-kicker">Exam setup</span><h3>{examForm.id ? 'Edit Exam' : 'Create Examination'}</h3></div><button type="button" className="secondary-btn" onClick={() => setExamModalOpen(false)}>Close</button></div><form onSubmit={handleExamSubmit} className="student-form-grid"><div className="field-group full-span"><label>Exam Name</label><input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} required /></div><div className="field-group"><label>Exam Type</label><select value={examForm.exam_type || 'Monthly Test'} onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}><option>Monthly Test</option><option>Four-and-a-Half-Month Examination</option><option>Annual Examination</option><option>Midterm Examination</option><option>Final Examination</option><option>Other</option></select></div><div className="field-group"><label>Academic Year</label><input value={examForm.academic_year || ''} onChange={(e) => setExamForm({ ...examForm, academic_year: e.target.value })} required /></div><div className="field-group"><label>Class</label><select value={String(examForm.school_class || '')} onChange={(e) => setExamForm({ ...examForm, school_class: e.target.value })} required><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></div><div className="field-group"><label>Maximum Marks</label><input type="number" min="1" value={examForm.max_marks || 100} onChange={(e) => setExamForm({ ...examForm, max_marks: Number(e.target.value) })} /></div><div className="field-group"><label>Start Date</label><input type="date" value={examForm.start_date || examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value, exam_date: e.target.value })} required /></div><div className="field-group"><label>End Date</label><input type="date" value={examForm.end_date || examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} required /></div><div className="field-group full-span"><label>Subjects for {selectedClass?.name || 'selected class'}</label><div className="subject-checklist">{subjectOptions.map((subject) => <label key={subject} className="subject-check"><input type="checkbox" checked={(examForm.subjects || (examForm.subject ? [examForm.subject] : [])).includes(subject)} onChange={(e) => { const current = examForm.subjects || (examForm.subject ? [examForm.subject] : []); const subjects = e.target.checked ? [...new Set([...current, subject])] : current.filter((item) => item !== subject); setExamForm({ ...examForm, subjects, subject: subjects[0] || '' }); }} />{subject}</label>)}</div>{subjectOptions.length === 0 && <p className="empty-text">No subjects are assigned to this class yet. Please configure the class subjects first.</p>}</div><div className="form-actions full-span"><button type="button" className="secondary-btn" onClick={() => setExamModalOpen(false)}>Cancel</button><button type="submit" className="primary-btn">{examForm.id ? 'Save Changes' : 'Create Examination'}</button></div></form></section></div>}</>;
  };

  const renderExams = () => renderExamsRedesigned();
  /* Legacy exam markup retained temporarily below for reference.
    const activeExam = exams.find((exam) => String(exam.id) === String(resultForm.exam));

    return (
      <>
        <header className="topbar"><h3>{user?.role === 'teacher' ? 'Exam Results' : 'Exams & Results'}</h3></header>
        {user?.role !== 'teacher' && (
          <>
            <section className="panel form-panel">
              <h4>Add Exam</h4>
              <form onSubmit={handleExamSubmit} className="student-form">
                <input value={examForm.name} placeholder="Exam name" onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} />
                <select value={String(examForm.school_class ?? '')} onChange={(e) => setExamForm({ ...examForm, school_class: e.target.value })}>
                  <option value="">Select class</option>
                  {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
                </select>
                <input value={examForm.subject} placeholder="Subject" onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })} />
                <select value={examForm.exam_type || 'Monthly Test'} onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}>
                  <option value="Monthly Test">Monthly Test</option>
                  <option value="Midterm Examination">Midterm Examination</option>
                  <option value="Final Examination">Final Examination</option>
                  <option value="Other">Other</option>
                </select>
                <input value={examForm.academic_year || ''} placeholder="Academic year" onChange={(e) => setExamForm({ ...examForm, academic_year: e.target.value })} />
                <input type="date" value={examForm.start_date || examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })} />
                <input type="date" value={examForm.end_date || examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} />
                <input type="date" value={examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })} />
                <input type="number" value={examForm.max_marks || 100} onChange={(e) => setExamForm({ ...examForm, max_marks: Number(e.target.value) || 100 })} placeholder="Max marks" />
                <button type="submit">Add Exam</button>
              </form>
            </section>

            <section className="panel form-panel">
              <h4>Enter Result</h4>
              <form onSubmit={handleResultSubmit} className="student-form small-form">
                <select value={resultForm.student || ''} onChange={(e) => setResultForm({ ...resultForm, student: Number(e.target.value) })}>
                  <option value="">Select student</option>
                  {students.map((student) => (<option key={student.id} value={String(student.id)}>{student.name}</option>))}
                </select>
                <select value={resultForm.exam || ''} onChange={(e) => {
                  const nextExam = exams.find((exam) => String(exam.id) === String(e.target.value));
                  setResultForm({
                    ...resultForm,
                    exam: Number(e.target.value),
                    subject: nextExam?.subject || '',
                    total_marks: nextExam?.max_marks || resultForm.total_marks || 100,
                  });
                }}>
                  <option value="">Select exam</option>
                  {exams.map((exam) => (<option key={exam.id} value={String(exam.id)}>{exam.name}</option>))}
                </select>
                <input value={resultForm.subject || ''} placeholder="Subject" onChange={(e) => setResultForm({ ...resultForm, subject: e.target.value })} />
                <input type="number" value={resultForm.marks} onChange={(e) => setResultForm({ ...resultForm, marks: Number(e.target.value) })} placeholder="Marks" />
                <input type="number" value={resultForm.total_marks} onChange={(e) => setResultForm({ ...resultForm, total_marks: Number(e.target.value) || 100 })} placeholder="Total" />
                <div className="static-field">Auto grade: {resultForm.total_marks > 0 ? (Number(((resultForm.marks / resultForm.total_marks) * 100).toFixed(2))) : 0}%</div>
                <input value={resultForm.grade} onChange={(e) => setResultForm({ ...resultForm, grade: e.target.value })} placeholder="Grade override" />
                <button type="submit">Save Result</button>
              </form>
            </section>
          </>
        )}

        <section className="panel table-panel">
          <h4>Recent Results</h4>
          <table>
            <thead><tr><th>Student</th><th>Exam</th><th>Subject</th><th>Marks</th><th>Percentage</th><th>Grade</th>{user?.role !== 'teacher' && <th>Actions</th>}</tr></thead>
            <tbody>
              {(user?.role === 'teacher' ? teacherResults : results).slice(0, 12).map((item) => (
                <tr key={item.id}><td>{item.student_name}</td><td>{item.exam_name}</td><td>{item.subject || activeExam?.subject || '—'}</td><td>{item.marks}/{item.total_marks}</td><td>{item.percentage || Number(((item.marks / (item.total_marks || 1)) * 100).toFixed(2))}%</td><td>{item.grade}</td>{user?.role !== 'teacher' && <td><button type="button" className="small-action-btn danger" onClick={() => confirmAction('Delete result', 'This result will be removed.', () => handleDeleteResource('results', item.id))}>Delete</button></td>}</tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  };

  */

  const getEffectiveFeeStatus = (fee: FeeType) => {
    const total = Number(fee.total_due ?? fee.amount ?? 0);
    const paid = Number(fee.paid_amount ?? 0);
    const remaining = Number(fee.remaining_amount ?? Math.max(total - paid, 0));
    const dueDate = fee.due_date ? new Date(fee.due_date) : null;
    const isOverdue = dueDate && remaining > 0 && dueDate < new Date();

    if (remaining === 0) return 'Paid';
    if (paid > 0 && remaining > 0) return isOverdue ? 'Overdue' : 'Partially Paid';
    if (isOverdue) return 'Overdue';
    return 'Pending';
  };

  const feeModalStudents = students.filter((student) => {
    const className = classes.find((classItem) => String(classItem.id) === String(student.school_class))?.name || '';
    const searchValue = `${student.name} ${student.student_id} ${className}`.toLowerCase();
    const matchesSearch = !feeStudentSearch.trim() || searchValue.includes(feeStudentSearch.trim().toLowerCase());
    const matchesClass = feeStudentClassFilter === 'all' || String(student.school_class || '') === feeStudentClassFilter;
    return matchesSearch && matchesClass;
  });

  const renderFees = () => {
    const validFees = fees.filter((item) => !!item.student);
    const summary = validFees.reduce(
      (accumulator, item) => {
        const total = Number(item.total_due ?? item.amount ?? 0);
        const paid = Number(item.paid_amount ?? 0);
        const remaining = Number(item.remaining_amount ?? Math.max(total - paid, 0));
        const status = getEffectiveFeeStatus(item);

        accumulator.totalDue += total;
        accumulator.totalCollected += paid;
        accumulator.totalPending += remaining;
        if (status === 'Pending' || status === 'Partially Paid' || status === 'Overdue') {
          accumulator.pendingStudents += 1;
        }
        return accumulator;
      },
      { totalDue: 0, totalCollected: 0, totalPending: 0, pendingStudents: 0 },
    );

    const filteredFees = validFees.filter((item) => {
      const student = students.find((candidate) => candidate.id === item.student);
      const className = student?.school_class_name || classes.find((candidate) => String(candidate.id) === String(student?.school_class))?.name || '';
      const searchableText = [
        item.student_name || student?.name || '',
        student?.student_id || '',
        student?.father_name || '',
        student?.contact_number || '',
        className,
        item.fee_type || '',
        item.academic_year || '',
        item.notes || '',
        item.status || '',
      ].join(' ').toLowerCase();

      const matchesSearch = !feeSearch.trim() || searchableText.includes(feeSearch.trim().toLowerCase());
      const matchesClass = feeClassFilter === 'all' || String(student?.school_class || '') === feeClassFilter;
      const matchesType = feeTypeFilter === 'all' || item.fee_type === feeTypeFilter;
      const matchesAcademicYear = feeAcademicYearFilter === 'all' || String(item.academic_year || '') === feeAcademicYearFilter;
      const matchesStatus = feeStatusFilter === 'all' || getEffectiveFeeStatus(item) === feeStatusFilter;

      return matchesSearch && matchesClass && matchesType && matchesAcademicYear && matchesStatus;
    });

    const selectedFee = selectedFeeId ? validFees.find((item) => item.id === selectedFeeId) : null;
    const selectedStudent = selectedFee ? students.find((student) => student.id === selectedFee.student) : null;

    const resetFeeFilters = () => {
      setFeeSearch('');
      setFeeClassFilter('all');
      setFeeTypeFilter('all');
      setFeeAcademicYearFilter('all');
      setFeeStatusFilter('all');
    };

    return (
      <>
        <header className="topbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Fees & Payments</h3>
          <button type="button" className="primary-btn" onClick={() => setShowAddFeeModal(true)}>+ Add Fee</button>
        </header>

        <section className="cards" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <span>Total Due</span>
            <strong>AFN {formatNumber(summary.totalDue)}</strong>
          </div>
          <div className="stat-card">
            <span>Total Collected</span>
            <strong>AFN {formatNumber(summary.totalCollected)}</strong>
          </div>
          <div className="stat-card">
            <span>Total Pending</span>
            <strong>AFN {formatNumber(summary.totalPending)}</strong>
          </div>
          <div className="stat-card">
            <span>Students with Pending Fees</span>
            <strong>{summary.pendingStudents}</strong>
          </div>
        </section>

        <section className="panel student-toolbar-panel" style={{ marginBottom: 16 }}>
          <div className="student-toolbar" style={{ display: 'grid', gridTemplateColumns: '2.2fr repeat(4, minmax(150px, 1fr)) auto', gap: 12, alignItems: 'center' }}>
            <div className="search-field">
              <span>🔎</span>
              <input
                placeholder="Search by student, ID, class, or fee info"
                value={feeSearch}
                onChange={(e) => setFeeSearch(e.target.value)}
              />
            </div>

            <select value={feeClassFilter} onChange={(e) => setFeeClassFilter(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
            </select>

            <select value={feeTypeFilter} onChange={(e) => setFeeTypeFilter(e.target.value)}>
              <option value="all">All Fee Types</option>
              {[...new Set(fees.map((item) => item.fee_type).filter(Boolean))].map((feeType) => (
                <option key={feeType} value={feeType}>{feeType}</option>
              ))}
            </select>

            <select value={feeAcademicYearFilter} onChange={(e) => setFeeAcademicYearFilter(e.target.value)}>
              <option value="all">All Years</option>
              {[...new Set(fees.map((item) => item.academic_year).filter(Boolean))].map((year) => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>

            <select value={feeStatusFilter} onChange={(e) => setFeeStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
            </select>

            <button type="button" className="secondary-btn" onClick={resetFeeFilters}>Reset</button>
          </div>
        </section>

        <section className="panel table-panel">
          <h4>Fee Ledger</h4>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Student ID</th>
                <th>Class</th>
                <th>Fee Type</th>
                <th>Academic Year</th>
                <th>Total Due</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFees.slice(0, 20).map((item) => {
                const student = students.find((candidate) => candidate.id === item.student);
                const className = student?.school_class_name || classes.find((candidate) => String(candidate.id) === String(student?.school_class))?.name || '—';
                const total = Number(item.total_due ?? item.amount ?? 0);
                const paid = Number(item.paid_amount ?? 0);
                const remaining = Number(item.remaining_amount ?? Math.max(total - paid, 0));
                const feeStatus = getEffectiveFeeStatus(item);

                return (
                  <tr key={item.id}>
                    <td>{item.student_name || student?.name || '—'}</td>
                    <td>{student?.student_id || '—'}</td>
                    <td>{className}</td>
                    <td>{item.fee_type || '—'}</td>
                    <td>{item.academic_year || '—'}</td>
                    <td>AFN {formatNumber(total)}</td>
                    <td>AFN {formatNumber(paid)}</td>
                    <td>AFN {formatNumber(remaining)}</td>
                    <td>{item.due_date || '—'}</td>
                    <td><span className="status-badge">{feeStatus}</span></td>
                    <td style={{ position: 'relative' }}>
                      <button type="button" className="small-action-btn" onClick={() => setFeeActionMenuId((current) => current === (item.id ?? null) ? null : item.id ?? null)}>
                        Actions ⋮
                      </button>

                      {feeActionMenuId === item.id && (
                        <div className="action-menu" style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', border: '1px solid #dfe3ea', borderRadius: 8, boxShadow: '0 8px 18px rgba(0,0,0,0.08)', zIndex: 20, minWidth: 180, padding: 8 }}>
                          <button type="button" className="menu-item" onClick={() => { setSelectedFeeId(item.id ?? null); setShowFeeDetailsModal(true); setFeeActionMenuId(null); }}>View Details</button>
                          <button type="button" className="menu-item" onClick={() => { setSelectedFeeId(item.id ?? null); setFeePaymentForm({ ...initialFeePayment, fee: item.id ?? 0, payment_date: new Date().toISOString().slice(0, 10) }); setShowPaymentModal(true); setFeeActionMenuId(null); }}>Record Payment</button>
                          <button type="button" className="menu-item" onClick={() => { setSelectedFeeId(item.id ?? null); setShowPaymentHistoryModal(true); setFeeActionMenuId(null); }}>Payment History</button>
                          <button type="button" className="menu-item" onClick={() => { setSelectedFeeId(item.id ?? null); setFeeForm({ ...initialFee, student: item.student, school_class: item.school_class || student?.school_class || '', fee_type: item.fee_type || 'Monthly Tuition Fee', academic_year: item.academic_year || String(new Date().getFullYear()), amount: Number(item.amount || item.total_due || 0), total_due: Number(item.total_due ?? item.amount ?? 0), due_date: item.due_date || new Date().toISOString().slice(0, 10), payment_method: item.payment_method || 'Cash', notes: item.notes || '', status: item.status || 'Pending' }); setShowAddFeeModal(true); setFeeActionMenuId(null); }}>Edit Fee</button>
                          <button type="button" className="menu-item danger" onClick={() => { setSelectedFeeId(item.id ?? null); confirmAction('Delete fee record', 'This fee record and its financial history may be affected. Continue?', () => handleDeleteResource('fees', item.id)); setFeeActionMenuId(null); }}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredFees.length === 0 && (
            <p className="empty-text">No fee records found. Try changing your search or filters.</p>
          )}
        </section>

        {showAddFeeModal && (
          <div className="modal-backdrop">
            <div className="panel fee-modal-shell">
              <div className="modal-header">
                <h3>Add Fee</h3>
                <button type="button" className="secondary-btn" onClick={() => setShowAddFeeModal(false)}>Close</button>
              </div>

              <form onSubmit={handleFeeSubmit} className="student-form fee-form-shell">
                <div className="fee-student-picker full-span">
                  <div className="fee-student-filter-row">
                    <div className="search-field fee-search-field">
                      <span>🔎</span>
                      <input
                        value={feeStudentSearch}
                        onChange={(e) => setFeeStudentSearch(e.target.value)}
                        placeholder="Search by student name or ID"
                      />
                    </div>
                    <select value={feeStudentClassFilter} onChange={(e) => setFeeStudentClassFilter(e.target.value)}>
                      <option value="all">All classes</option>
                      {classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
                    </select>
                  </div>

                  <div className="fee-student-list">
                    {feeModalStudents.filter((student) => student.is_active !== false).map((student) => {
                      const className = classes.find((classItem) => String(classItem.id) === String(student.school_class))?.name || 'No class';
                      const isSelected = Number(student.id) === Number(feeForm.student);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          className={`fee-student-option ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            setFeeForm({
                              ...feeForm,
                              student: Number(student.id),
                              school_class: student.school_class || '',
                              student_name: student.name,
                            });
                          }}
                        >
                          <span>
                            <strong>{student.name}</strong>
                            <small>{student.student_id}</small>
                          </span>
                          <span>{className}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field-group">
                  <label>Student</label>
                  <input value={students.find((student) => Number(student.id) === Number(feeForm.student))?.name || 'Select a student'} readOnly />
                </div>

                <div className="field-group">
                  <label>Class</label>
                  <input value={classes.find((item) => String(item.id) === String(feeForm.school_class))?.name || 'Will populate from selected student'} readOnly />
                </div>

                <div className="field-group">
                  <label>Fee Type</label>
                  <select value={feeForm.fee_type || 'Monthly Tuition Fee'} onChange={(e) => setFeeForm({ ...feeForm, fee_type: e.target.value })}>
                    <option value="Monthly Tuition Fee">Monthly Tuition Fee</option>
                    <option value="Admission Fee">Admission Fee</option>
                    <option value="Registration Fee">Registration Fee</option>
                    <option value="Examination Fee">Examination Fee</option>
                    <option value="Other School Fee">Other School Fee</option>
                  </select>
                </div>

                <div className="field-group">
                  <label>Academic Year</label>
                  <input value={feeForm.academic_year || ''} placeholder="Example: 2026" onChange={(e) => setFeeForm({ ...feeForm, academic_year: e.target.value })} />
                </div>

                <div className="field-group">
                  <label>Total Due (AFN)</label>
                  <input type="number" value={feeForm.total_due ?? feeForm.amount ?? 0} placeholder="Enter total due amount" onChange={(e) => setFeeForm({ ...feeForm, amount: Number(e.target.value), total_due: Number(e.target.value) })} />
                </div>

                <div className="field-group">
                  <label>Paid Amount (AFN)</label>
                  <input type="number" value={feeForm.paid_amount ?? 0} placeholder="Enter paid amount" onChange={(e) => setFeeForm({ ...feeForm, paid_amount: Number(e.target.value) })} />
                </div>

                <div className="field-group">
                  <label>Remaining (AFN)</label>
                  <input
                    type="number"
                    value={Math.max((Number(feeForm.total_due ?? feeForm.amount ?? 0) - Number(feeForm.paid_amount ?? 0)), 0)}
                    readOnly
                  />
                </div>

                <div className="field-group">
                  <label>Due Date</label>
                  <input type="date" value={feeForm.due_date || ''} onChange={(e) => setFeeForm({ ...feeForm, due_date: e.target.value })} />
                </div>

                <div className="field-group full-span">
                  <label>Notes</label>
                  <textarea value={feeForm.notes || ''} placeholder="Optional notes" onChange={(e) => setFeeForm({ ...feeForm, notes: e.target.value })} />
                </div>

                <div className="form-actions full-span">
                  <button type="button" className="secondary-btn" onClick={() => setShowAddFeeModal(false)}>Cancel</button>
                  <button type="submit" className="primary-btn">Save Fee</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showPaymentModal && selectedFee && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div className="panel" style={{ width: 'min(640px, 90vw)', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0 }}>Record Payment</h3>
                <button type="button" className="secondary-btn" onClick={() => setShowPaymentModal(false)}>Close</button>
              </div>

              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '4px 0' }}><strong>Student:</strong> {selectedStudent?.name || '—'}</p>
                <p style={{ margin: '4px 0' }}><strong>Class:</strong> {classes.find((item) => String(item.id) === String(selectedStudent?.school_class))?.name || '—'}</p>
                <p style={{ margin: '4px 0' }}><strong>Fee Type:</strong> {selectedFee.fee_type || '—'}</p>
                <p style={{ margin: '4px 0' }}><strong>Total Due:</strong> AFN {formatNumber(Number(selectedFee.total_due ?? selectedFee.amount ?? 0))}</p>
                <p style={{ margin: '4px 0' }}><strong>Already Paid:</strong> AFN {formatNumber(Number(selectedFee.paid_amount ?? 0))}</p>
                <p style={{ margin: '4px 0' }}><strong>Remaining:</strong> AFN {formatNumber(Number(selectedFee.remaining_amount ?? Math.max(Number(selectedFee.total_due ?? selectedFee.amount ?? 0) - Number(selectedFee.paid_amount ?? 0), 0)))}</p>
              </div>

              <form onSubmit={(event) => { void handleFeePaymentSubmit(event); setShowPaymentModal(false); }} className="student-form">
                <div className="field-group">
                  <label>Payment Amount</label>
                  <input type="number" value={feePaymentForm.amount} placeholder="AFN amount" onChange={(e) => setFeePaymentForm({ ...feePaymentForm, amount: Number(e.target.value) })} />
                </div>

                <div className="field-group">
                  <label>Payment Date</label>
                  <input type="date" value={feePaymentForm.payment_date} onChange={(e) => setFeePaymentForm({ ...feePaymentForm, payment_date: e.target.value })} />
                </div>

                <div className="field-group">
                  <label>Payment Method</label>
                  <select value={feePaymentForm.payment_method || 'Cash'} onChange={(e) => setFeePaymentForm({ ...feePaymentForm, payment_method: e.target.value })}>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Easypaisa">Easypaisa</option>
                    <option value="Card">Card</option>
                  </select>
                </div>

                <div className="field-group">
                  <label>Notes</label>
                  <textarea value={feePaymentForm.notes || ''} placeholder="Optional payment notes" onChange={(e) => setFeePaymentForm({ ...feePaymentForm, notes: e.target.value })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button type="button" className="secondary-btn" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                  <button type="submit" className="primary-btn">Record Payment</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showPaymentHistoryModal && selectedFee && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div className="panel" style={{ width: 'min(760px, 90vw)', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0 }}>Payment History</h3>
                <button type="button" className="secondary-btn" onClick={() => setShowPaymentHistoryModal(false)}>Close</button>
              </div>

              <p><strong>Student:</strong> {selectedStudent?.name || '—'} | <strong>Student ID:</strong> {selectedStudent?.student_id || '—'} | <strong>Class:</strong> {classes.find((item) => String(item.id) === String(selectedStudent?.school_class))?.name || '—'}</p>
              <p><strong>Fee Type:</strong> {selectedFee.fee_type || '—'} | <strong>Total Due:</strong> AFN {formatNumber(Number(selectedFee.total_due ?? selectedFee.amount ?? 0))} | <strong>Paid:</strong> AFN {formatNumber(Number(selectedFee.paid_amount ?? 0))} | <strong>Remaining:</strong> AFN {formatNumber(Number(selectedFee.remaining_amount ?? Math.max(Number(selectedFee.total_due ?? selectedFee.amount ?? 0) - Number(selectedFee.paid_amount ?? 0), 0)))}</p>

              <table style={{ width: '100%', marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedFee.payments || []).length > 0 ? (selectedFee.payments || []).map((payment) => (
                    <tr key={payment.id ?? `${payment.payment_date}-${payment.amount}`}>
                      <td>{payment.payment_date || '—'}</td>
                      <td>AFN {formatNumber(Number(payment.amount || 0))}</td>
                      <td>{payment.payment_method || '—'}</td>
                      <td>{payment.notes || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#666' }}>No payment history yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showFeeDetailsModal && selectedFee && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div className="panel" style={{ width: 'min(760px, 90vw)', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0 }}>Fee Details</h3>
                <button type="button" className="secondary-btn" onClick={() => setShowFeeDetailsModal(false)}>Close</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
                <div><strong>Student:</strong> {selectedStudent?.name || '—'}</div>
                <div><strong>Student ID:</strong> {selectedStudent?.student_id || '—'}</div>
                <div><strong>Class:</strong> {classes.find((item) => String(item.id) === String(selectedStudent?.school_class))?.name || '—'}</div>
                <div><strong>Fee Type:</strong> {selectedFee.fee_type || '—'}</div>
                <div><strong>Academic Year:</strong> {selectedFee.academic_year || '—'}</div>
                <div><strong>Total Due:</strong> AFN {formatNumber(Number(selectedFee.total_due ?? selectedFee.amount ?? 0))}</div>
                <div><strong>Total Paid:</strong> AFN {formatNumber(Number(selectedFee.paid_amount ?? 0))}</div>
                <div><strong>Remaining:</strong> AFN {formatNumber(Number(selectedFee.remaining_amount ?? Math.max(Number(selectedFee.total_due ?? selectedFee.amount ?? 0) - Number(selectedFee.paid_amount ?? 0), 0)))}</div>
                <div><strong>Due Date:</strong> {selectedFee.due_date || '—'}</div>
                <div><strong>Status:</strong> {getEffectiveFeeStatus(selectedFee)}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {selectedFee.notes || '—'}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button type="button" className="secondary-btn" onClick={() => { setShowFeeDetailsModal(false); setShowPaymentModal(true); }}>Record Payment</button>
                <button type="button" className="secondary-btn" onClick={() => { setShowFeeDetailsModal(false); setShowPaymentHistoryModal(true); }}>View Payment History</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderHomework = () => (
    <>
      <header className="topbar"><h3>Homework</h3></header>
      <section className="panel form-panel">
        <h4>Publish Homework</h4>
        <form onSubmit={handleHomeworkSubmit} className="student-form">
          <input value={homeworkForm.title} placeholder="Title" onChange={(e) => setHomeworkForm({ ...homeworkForm, title: e.target.value })} />
          <input value={homeworkForm.subject} placeholder="Subject" onChange={(e) => setHomeworkForm({ ...homeworkForm, subject: e.target.value })} />
          <select value={String(homeworkForm.school_class ?? '')} onChange={(e) => setHomeworkForm({ ...homeworkForm, school_class: e.target.value })}>
            <option value="">Select class</option>
            {classes.map((item) => (<option key={item.id} value={String(item.id)}>{item.name}</option>))}
          </select>
          <input type="date" value={homeworkForm.due_date} onChange={(e) => setHomeworkForm({ ...homeworkForm, due_date: e.target.value })} />
          <textarea value={homeworkForm.description} placeholder="Description" onChange={(e) => setHomeworkForm({ ...homeworkForm, description: e.target.value })} />
          <button type="submit">Publish Homework</button>
        </form>
      </section>
      <section className="panel table-panel">
        <h4>Homework List</h4>
        <table>
          <thead><tr><th>Title</th><th>Subject</th><th>Due Date</th></tr></thead>
          <tbody>
            {homework.slice(0, 8).map((item) => (
              <tr key={item.id}><td>{item.title}</td><td>{item.subject}</td><td>{item.due_date}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );

  const renderAnnouncements = () => {
    const visibleAnnouncements = announcements.filter((item) => {
      const searchable = `${item.title} ${item.content} ${item.school_class_name || ''}`.toLowerCase();
      return (!announcementSearch.trim() || searchable.includes(announcementSearch.toLowerCase())) && (announcementAudienceFilter === 'all' || item.audience === announcementAudienceFilter) && (announcementStatusFilter === 'all' || (item.effective_status || item.status) === announcementStatusFilter);
    });
    const openNewAnnouncement = () => { setAnnouncementForm(initialAnnouncement); setAnnouncementModalOpen(true); };
    return <>
      <header className="topbar"><div><span className="page-kicker">School communication</span><h3>Announcements</h3><p>Create and manage important school announcements.</p></div><button type="button" className="primary-action-btn" onClick={openNewAnnouncement}>+ New Announcement</button></header>
      <section className="panel student-toolbar-panel"><div className="student-toolbar"><div className="search-field"><span>🔎</span><input placeholder="Search announcements..." value={announcementSearch} onChange={(e) => setAnnouncementSearch(e.target.value)} /></div><select value={announcementAudienceFilter} onChange={(e) => setAnnouncementAudienceFilter(e.target.value)}><option value="all">All Audiences</option><option value="Everyone">Everyone</option><option value="Students">All Students</option><option value="Teachers">All Teachers</option><option value="Class">Specific Class</option></select><select value={announcementStatusFilter} onChange={(e) => setAnnouncementStatusFilter(e.target.value)}><option value="all">All Statuses</option><option>Draft</option><option>Published</option><option>Scheduled</option><option>Expired</option></select></div></section>
      <section className="panel table-panel"><div className="table-header-row"><div><span className="panel-kicker">School notices</span><h4>Announcements</h4></div><span className="muted-count">{visibleAnnouncements.length} found</span></div><div className="announcement-list">{visibleAnnouncements.map((item) => <article className="announcement-card" key={item.id}><div><h4>{item.title}</h4><p>{item.content}</p><small>Audience: {item.audience === 'Class' ? item.school_class_name : item.audience} · Published: {item.created_at ? formatDate(item.created_at) : '—'} · By {item.created_by_name || 'School admin'}</small></div><div className="row-actions"><span className={`status-badge status-${(item.effective_status || item.status || 'Draft').toLowerCase()}`}>{item.effective_status || item.status || 'Draft'}</span><button type="button" className="small-action-btn" onClick={() => setAnnouncementDetail(item)}>View</button><button type="button" className="small-action-btn" onClick={() => { setAnnouncementForm(item); setAnnouncementModalOpen(true); }}>Edit</button><button type="button" className="small-action-btn danger" onClick={() => confirmAction('Delete announcement', 'This announcement will be permanently removed.', () => handleDeleteResource('announcements', item.id))}>Delete</button></div></article>)}</div>{visibleAnnouncements.length === 0 && <p className="empty-text">No announcements match the current filters.</p>}</section>
      {announcementDetail && <div className="modal-backdrop"><section className="panel exam-results-modal"><div className="modal-header"><div><span className="page-kicker">Announcement details</span><h3>{announcementDetail.title}</h3></div><button type="button" className="secondary-btn" onClick={() => setAnnouncementDetail(null)}>Close</button></div><p className="announcement-detail-content">{announcementDetail.content}</p><p><strong>Audience:</strong> {announcementDetail.audience === 'Class' ? announcementDetail.school_class_name : announcementDetail.audience}</p><p><strong>Author:</strong> {announcementDetail.created_by_name || 'School admin'}</p><p><strong>Status:</strong> {announcementDetail.effective_status || announcementDetail.status}</p></section></div>}
      {announcementModalOpen && <div className="modal-backdrop"><section className="panel form-panel announcement-modal"><div className="modal-header"><div><span className="page-kicker">School communication</span><h3>{announcementForm.id ? 'Edit Announcement' : 'New Announcement'}</h3></div><button type="button" className="secondary-btn" onClick={() => setAnnouncementModalOpen(false)}>Close</button></div><form onSubmit={handleAnnouncementSubmit} className="student-form-grid"><div className="field-group full-span"><label>Title</label><input value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required /></div><div className="field-group full-span"><label>Announcement Content</label><textarea rows={6} value={announcementForm.content} onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })} required /></div><div className="field-group"><label>Audience</label><select value={announcementForm.audience || 'Everyone'} onChange={(e) => setAnnouncementForm({ ...announcementForm, audience: e.target.value, school_class: null })}><option value="Everyone">All Staff and Students</option><option value="Students">All Students</option><option value="Teachers">All Teachers</option><option value="Class">Specific Class</option></select></div>{announcementForm.audience === 'Class' && <div className="field-group"><label>Class</label><select value={String(announcementForm.school_class || '')} onChange={(e) => setAnnouncementForm({ ...announcementForm, school_class: e.target.value })} required><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></div>}<div className="field-group"><label>Status</label><select value={announcementForm.status || 'Published'} onChange={(e) => setAnnouncementForm({ ...announcementForm, status: e.target.value })}><option>Draft</option><option>Published</option></select></div><div className="form-actions full-span"><button type="button" className="secondary-btn" onClick={() => setAnnouncementModalOpen(false)}>Cancel</button><button type="submit" className="primary-action-btn">{announcementForm.status === 'Draft' ? 'Save Draft' : 'Publish'}</button></div></form></section></div>}
    </>;
  };

  const renderActiveSection = () => {
    if (user?.role === 'teacher') {
      switch (activeSection) {
        case 'teachers': return renderTeacherDashboard();
        case 'classes': return renderTeacherClasses();
        case 'timetable': return renderTimetable();
        case 'attendance': return renderAttendance();
        case 'exams': return renderExams();
        case 'homework': return renderHomework();
        case 'announcements': return renderAnnouncements();
        default: return renderTeacherDashboard();
      }
    }

    switch (activeSection) {
      case 'students': return renderStudents();
      case 'teachers': return renderTeachers();
      case 'classes': return renderClasses();
      case 'attendance': return renderAttendance();
      case 'timetable': return renderTimetable();
      case 'reports': return renderReports();
      case 'exams': return renderExams();
      case 'fees': return renderFees();
      case 'homework': return renderHomework();
      case 'announcements': return renderAnnouncements();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  };

  return (
    <LocalizedContent><>
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.variant}`}>
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            {toast.variant === 'confirm' && (
              <div className="toast-actions">
                <button type="button" onClick={() => { toast.onConfirm?.(); }}>{toast.confirmText || 'OK'}</button>
                <button type="button" className="secondary-btn" onClick={() => { toast.onCancel?.(); }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="app-shell">
        <aside className="sidebar">
        <div className="sidebar-heading"><h2>{t('brand.admin')}</h2><label className="language-switcher"><span>{t('language.label')}</span><select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)} aria-label={t('language.label')}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.nativeLabel}</option>)}</select></label></div>
        <nav>
          {navItems.map((item) => <button key={item.key} type="button" className={activeSection === item.key ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveSection(item.key)}>{item.label}</button>)}
        </nav>
        <button className="logout-btn" onClick={handleLogout}>{t('nav.logout')}</button>
        </aside>
        <main className="content">{renderActiveSection()}</main>
      </div>
    </></LocalizedContent>
  );
}

export default App;
