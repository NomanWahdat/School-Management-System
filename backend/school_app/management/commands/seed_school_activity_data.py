from datetime import date, timedelta

from django.core.management.base import BaseCommand

from school_app.models import Announcement, Exam, Result, SchoolClass, Student, Teacher, TimetableEntry, User


class Command(BaseCommand):
    help = 'Seed timetable, exams, results, and announcements so the school management demo is fully populated.'

    def handle(self, *args, **options):
        classes = list(SchoolClass.objects.all().order_by('id'))
        if not classes:
            self.stdout.write(self.style.WARNING('No classes found. Run seed_school_data first.'))
            return

        active_teachers = list(Teacher.objects.filter(status='Active').order_by('id'))
        if not active_teachers:
            self.stdout.write(self.style.WARNING('No active teachers found. Run seed_school_data first.'))
            return

        admin_user = User.objects.filter(role='admin').first() or User.objects.filter(username='admin').first()
        if not admin_user:
            self.stdout.write(self.style.WARNING('No admin user found.'))
            return

        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        subjects = ['Mathematics', 'Science', 'English', 'Computer', 'History', 'Biology', 'Art', 'Physics']
        start_times = ['08:00', '09:00', '10:00', '11:00', '12:00']
        end_offsets = [
            ('08:00', '09:00'),
            ('09:00', '10:00'),
            ('10:00', '11:00'),
            ('11:00', '12:00'),
            ('12:00', '13:00'),
        ]

        timetable_created = 0
        for class_index, school_class in enumerate(classes, start=1):
            teacher = active_teachers[(class_index - 1) % len(active_teachers)]
            for day_index, day in enumerate(days):
                subject = subjects[(class_index + day_index) % len(subjects)]
                start_time, end_time = end_offsets[(class_index + day_index) % len(end_offsets)]

                entry, created = TimetableEntry.objects.get_or_create(
                    day=day,
                    school_class=school_class,
                    subject=subject,
                    teacher=teacher,
                    defaults={
                        'start_time': start_time,
                        'end_time': end_time,
                    },
                )
                if created:
                    timetable_created += 1

        exam_created = 0
        exam_subjects = {
            'Mathematics': 'Mid-Term Exam',
            'Science': 'Quiz Exam',
            'English': 'Writing Assessment',
            'Computer': 'Practical Exam',
            'History': 'Unit Test',
            'Biology': 'Lab Assessment',
            'Art': 'Creative Project',
            'Physics': 'Concept Test',
        }

        for class_index, school_class in enumerate(classes, start=1):
            for offset, subject in enumerate(subjects[:3]):
                exam_name = exam_subjects.get(subject, 'Assessment')
                exam_date = date.today() - timedelta(days=(class_index * 4 + offset * 3))
                exam, created = Exam.objects.get_or_create(
                    name=exam_name,
                    school_class=school_class,
                    subject=subject,
                    exam_date=exam_date,
                )
                if created:
                    exam_created += 1

                class_students = list(Student.objects.filter(school_class=school_class, is_active=True).order_by('id')[:3])
                for student_index, student in enumerate(class_students, start=1):
                    marks = 70 + ((student_index + class_index) * 7) % 28
                    total_marks = 100
                    percentage = round((marks / total_marks) * 100, 2)
                    if percentage >= 90:
                        grade = 'A+'
                    elif percentage >= 80:
                        grade = 'A'
                    elif percentage >= 70:
                        grade = 'B'
                    elif percentage >= 60:
                        grade = 'C'
                    elif percentage >= 50:
                        grade = 'D'
                    else:
                        grade = 'F'

                    Result.objects.get_or_create(
                        student=student,
                        exam=exam,
                        defaults={
                            'marks': marks,
                            'total_marks': total_marks,
                            'percentage': percentage,
                            'grade': grade,
                        },
                    )

        announcement_data = [
            (
                'School Assembly',
                'All students and staff are required to attend the school assembly on Monday at 8:30 AM.',
                'Everyone',
            ),
            (
                'Science Lab Safety Reminder',
                'Please bring your lab coats and follow the safety instructions before entering the science lab.',
                'Students',
            ),
            (
                'Parent Meeting',
                'The school will host a parent meeting for all classes next Friday at 4:00 PM in the main hall.',
                'Everyone',
            ),
            (
                'Exam Timetable Released',
                'The upcoming mid-term examination schedule is now available on the notice board and student portal.',
                'Students',
            ),
        ]

        announcements_created = 0
        for title, content, audience in announcement_data:
            announcement, created = Announcement.objects.get_or_create(
                title=title,
                defaults={
                    'content': content,
                    'created_by': admin_user,
                    'audience': audience,
                    'status': 'Published',
                },
            )
            if created:
                announcements_created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded {timetable_created} timetable entries, {exam_created} exams, results for all class records, and {announcements_created} announcements.'
            )
        )
