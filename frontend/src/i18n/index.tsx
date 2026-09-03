import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { translateLegacyText } from './legacyUi';

export type Locale = 'en' | 'fa' | 'ps';

export const localeOptions: Array<{ value: Locale; label: string; nativeLabel: string }> = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fa', label: 'Dari', nativeLabel: 'دری' },
  { value: 'ps', label: 'Pashto', nativeLabel: 'پښتو' },
];

const translations: Record<Locale, Record<string, string>> = {
  en: {
    'language.label': 'Language', 'brand.admin': 'School Admin', 'brand.staffAccess': 'Staff access',
    'dashboard.greeting': 'Good morning,', 'dashboard.overview': 'Here is an overview of your school today.',
    'nav.dashboard': 'Dashboard', 'nav.students': 'Students', 'nav.teachers': 'Teachers', 'nav.classes': 'Classes',
    'nav.timetable': 'Timetable', 'nav.attendance': 'Attendance', 'nav.fees': 'Fees', 'nav.exams': 'Exams & Results',
    'nav.announcements': 'Announcements', 'nav.reports': 'Reports', 'nav.settings': 'Settings', 'nav.homework': 'Homework',
    'nav.myDashboard': 'My Dashboard', 'nav.myClasses': 'My Classes', 'nav.todayTimetable': "Today's Timetable", 'nav.examResults': 'Exam Results', 'nav.logout': 'Logout',
    'auth.loginTitle': 'Admin and Teacher Login', 'auth.loginDescription': 'Sign in to continue to your school workspace.', 'auth.username': 'Username', 'auth.password': 'Password', 'auth.login': 'Login', 'auth.signingIn': 'Signing in...', 'auth.forgotPassword': 'Forgot password?', 'auth.showPassword': 'Show', 'auth.hidePassword': 'Hide', 'auth.sessionExpired': 'Your session expired. Please sign in again.', 'auth.changePassword': 'Change your password', 'auth.changePasswordDescription': 'Your administrator requires a new password before you continue.', 'auth.currentPassword': 'Current password', 'auth.newPassword': 'New password', 'auth.saving': 'Saving...', 'auth.savePassword': 'Change password',
  },
  fa: {
    'language.label': 'زبان', 'brand.admin': 'مدیریت مکتب', 'brand.staffAccess': 'دسترسی کارمندان',
    'dashboard.greeting': 'صبح بخیر،', 'dashboard.overview': 'این گزارش امروز مکتب شما است.',
    'nav.dashboard': 'داشبورد', 'nav.students': 'شاگردان', 'nav.teachers': 'استادان', 'nav.classes': 'صنف‌ها', 'nav.timetable': 'تقسیم اوقات', 'nav.attendance': 'حاضری', 'nav.fees': 'فیس‌ها', 'nav.exams': 'امتحانات و نتایج', 'nav.announcements': 'اطلاعیه‌ها', 'nav.reports': 'گزارش‌ها', 'nav.settings': 'تنظیمات', 'nav.homework': 'وظایف خانه‌گی', 'nav.myDashboard': 'داشبورد من', 'nav.myClasses': 'صنف‌های من', 'nav.todayTimetable': 'تقسیم اوقات امروز', 'nav.examResults': 'نتایج امتحان', 'nav.logout': 'خروج',
    'auth.loginTitle': 'ورود مدیر و استاد', 'auth.loginDescription': 'برای ادامه به محیط مکتب وارد شوید.', 'auth.username': 'نام کاربری', 'auth.password': 'رمز عبور', 'auth.login': 'ورود', 'auth.signingIn': 'در حال ورود...', 'auth.forgotPassword': 'رمز عبور را فراموش کرده‌اید؟', 'auth.showPassword': 'نمایش', 'auth.hidePassword': 'پنهان', 'auth.sessionExpired': 'جلسه شما پایان یافته است. لطفاً دوباره وارد شوید.', 'auth.changePassword': 'رمز عبور خود را تغییر دهید', 'auth.changePasswordDescription': 'مدیر از شما خواسته است پیش از ادامه رمز عبور جدید تعیین کنید.', 'auth.currentPassword': 'رمز عبور فعلی', 'auth.newPassword': 'رمز عبور جدید', 'auth.saving': 'در حال ذخیره...', 'auth.savePassword': 'تغییر رمز عبور',
  },
  ps: {
    'language.label': 'ژبه', 'brand.admin': 'د ښوونځي اداره', 'brand.staffAccess': 'د کارکوونکو لاسرسی',
    'dashboard.greeting': 'سهار مو پخیر،', 'dashboard.overview': 'دا د نن ورځې د ښوونځي لنډیز دی.',
    'nav.dashboard': 'ډشبورډ', 'nav.students': 'زده کوونکي', 'nav.teachers': 'ښوونکي', 'nav.classes': 'ټولګي', 'nav.timetable': 'مهال وېش', 'nav.attendance': 'حاضري', 'nav.fees': 'فیسونه', 'nav.exams': 'ازموینې او پایلې', 'nav.announcements': 'خبرتیاوې', 'nav.reports': 'راپورونه', 'nav.settings': 'تنظیمات', 'nav.homework': 'کورنی کار', 'nav.myDashboard': 'زما ډشبورډ', 'nav.myClasses': 'زما ټولګي', 'nav.todayTimetable': 'د نن ورځې مهال وېش', 'nav.examResults': 'د ازموینې پایلې', 'nav.logout': 'وتل',
    'auth.loginTitle': 'د مدیر او ښوونکي ننوتل', 'auth.loginDescription': 'د خپل ښوونځي کاري چاپېریال ته د دوام لپاره ننوځئ.', 'auth.username': 'کارن نوم', 'auth.password': 'پټ نوم', 'auth.login': 'ننوتل', 'auth.signingIn': 'د ننوتلو په حال کې...', 'auth.forgotPassword': 'پټ نوم مو هېر کړی؟', 'auth.showPassword': 'ښکاره کول', 'auth.hidePassword': 'پټول', 'auth.sessionExpired': 'ستاسې ناسته پای ته رسېدلې. بیا ننوځئ.', 'auth.changePassword': 'خپل پټ نوم بدل کړئ', 'auth.changePasswordDescription': 'مدیر له تاسې غوښتي چې له دوام مخکې نوی پټ نوم وټاکئ.', 'auth.currentPassword': 'اوسنی پټ نوم', 'auth.newPassword': 'نوی پټ نوم', 'auth.saving': 'د خوندي کولو په حال کې...', 'auth.savePassword': 'پټ نوم بدلول',
  },
};

type I18nContextValue = { locale: Locale; direction: 'ltr' | 'rtl'; setLocale: (locale: Locale) => void; t: (key: string, fallback?: string) => string; formatNumber: (value: number) => string; formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string };
const I18nContext = createContext<I18nContextValue | null>(null);
const storageKey = 'school_locale';

function getInitialLocale(): Locale {
  const saved = window.localStorage.getItem(storageKey);
  return saved === 'fa' || saved === 'ps' || saved === 'en' ? saved : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const direction = locale === 'en' ? 'ltr' : 'rtl';
  useEffect(() => {
    window.localStorage.setItem(storageKey, locale);
    document.documentElement.lang = locale === 'fa' ? 'fa-AF' : locale === 'ps' ? 'ps-AF' : 'en';
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [direction, locale]);
  const t = (key: string, fallback?: string) => translations[locale][key] || translations.en[key] || fallback || key;
  const formatNumber = (value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-AF' : `${locale}-AF`).format(value);
  const formatDate = (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === 'en' ? 'en-AF' : `${locale}-AF`, options).format(new Date(value));
  return <I18nContext.Provider value={{ locale, direction, setLocale: setLocaleState, t, formatNumber, formatDate }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

function localizeNode(node: ReactNode, locale: Locale): ReactNode {
  if (typeof node === 'string') return translateLegacyText(node, locale);
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const localizedProps = { ...props };
  for (const attribute of ['aria-label', 'placeholder', 'title']) {
    if (typeof props[attribute] === 'string') localizedProps[attribute] = translateLegacyText(props[attribute], locale);
  }
  const children = Children.map(props.children as ReactNode, (child) => localizeNode(child, locale));
  return cloneElement(node, localizedProps, children);
}

export function LocalizedContent({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <>{Children.map(children, (child) => localizeNode(child, locale))}</>;
}
