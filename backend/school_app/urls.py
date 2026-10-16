from django.urls import path
from . import workflow_views as workflow
from . import views as v

urlpatterns = [
    path('curriculum/', workflow.CurriculumView.as_view()),
    path('attendance-session/', workflow.AttendanceSessionView.as_view()),
    path('notifications/', workflow.NotificationView.as_view()),
    path('finance-summary/', workflow.FinanceSummaryView.as_view()),
    path('students/<int:pk>/statement/', workflow.StudentStatementView.as_view()),
    path('login/', v.LoginView.as_view(), name='login'),
    path('forgot-password/', v.ForgotPasswordView.as_view(), name='forgot-password'),
    path('school-branding/', v.PublicSchoolBrandingView.as_view(), name='school-branding'),
    path('schools/<slug:slug>/branding/', v.PublicSchoolBrandingView.as_view(), name='school-branding-slug'),
    path('token/refresh/', v.SessionRefreshView.as_view(), name='token_refresh'),
    path('schools/', v.SchoolSelectionView.as_view(), name='school-selection'),
    path('school-context/', v.SchoolContextView.as_view(), name='school-context'),
    path('change-password/', v.ChangePasswordView.as_view(), name='change-password'),
    path('profile/', v.ProfileView.as_view(), name='profile'),
    path('logout/', v.LogoutView.as_view(), name='logout'),
    path('logout-all/', v.LogoutAllView.as_view(), name='logout-all'),
    path('platform/schools/', v.PlatformSchoolsView.as_view(), name='platform-schools'),
    path('platform/schools/<int:pk>/', v.PlatformSchoolDetailView.as_view(), name='platform-school-detail'),
    path('platform/schools/<int:pk>/memberships/', v.PlatformMembershipView.as_view(), name='platform-memberships'),
    path('platform/schools/<int:pk>/access/', v.PlatformSchoolAccessView.as_view(), name='platform-school-access'),
    path('platform/audit/', v.PlatformAuditView.as_view(), name='platform-audit'),
    path('platform/memberships/<int:pk>/reset-password/', v.PlatformPasswordResetView.as_view(), name='platform-password-reset'),
    path('branding/', v.SchoolBrandingView.as_view(), name='branding'),
    path('dashboard/', v.DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('teacher-dashboard/', v.TeacherDashboardView.as_view(), name='teacher-dashboard'),
    path('reports/', v.ReportsSummaryView.as_view(), name='reports'),
    path('follow-up/', v.FollowUpView.as_view(), name='follow-up'),
    path('audit/', v.SchoolAuditView.as_view(), name='school-audit'),
    path('promotions/', v.PromotionView.as_view(), name='promotions'),
    path('results/bulk/', v.BulkResultsView.as_view(), name='bulk-results'),
    path('exams/<int:pk>/roster/', v.ExamRosterView.as_view(), name='exam-roster'),
    path('settings/', v.SchoolSettingsView.as_view(), name='settings'),
    path('students/<int:pk>/report-card/', v.ReportCardView.as_view(), name='report-card'),
    path('fee-payments/<int:pk>/receipt/', v.ReceiptView.as_view(), name='receipt'),
    path('fee-payments/', v.FeePaymentListCreateView.as_view(), name='fee-payments'),
    path('teachers/<int:pk>/account/', v.TeacherAccountView.as_view(), name='teacher-account'),
    path('teachers/<int:pk>/account/reset-password/', v.TeacherAccountResetPasswordView.as_view(), name='teacher-account-reset'),
    path('enrollments/', v.EnrollmentListView.as_view(), name='enrollments'),
]

resources = [
    ('students', v.StudentListCreateView, v.StudentDetailView),
    ('teachers', v.TeacherListCreateView, v.TeacherDetailView),
    ('classes', v.ClassListCreateView, v.ClassDetailView),
    ('attendance', v.AttendanceListCreateView, v.AttendanceDetailView),
    ('exams', v.ExamListCreateView, v.ExamDetailView),
    ('results', v.ResultListCreateView, v.ResultDetailView),
    ('fees', v.FeeListCreateView, v.FeeDetailView),
    ('timetable', v.TimetableListCreateView, v.TimetableDetailView),
    ('homework', v.HomeworkListCreateView, v.HomeworkDetailView),
    ('announcements', v.AnnouncementListCreateView, v.AnnouncementDetailView),
    ('guardians', v.GuardianListView, v.GuardianDetailView),
]
for name, listing, detail in resources:
    singular = 'class' if name == 'classes' else name.rstrip('s')
    urlpatterns += [path(f'{name}/', listing.as_view(), name=name), path(f'{name}/<int:pk>/', detail.as_view(), name=f'{singular}-detail')]
