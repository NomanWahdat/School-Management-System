"""Synthetic, repeatable demonstrations in a dedicated school; never reset existing data."""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from random import Random
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from school_app.models import (School, User, Membership, SchoolSettings, SchoolClass, Teacher, Student, Guardian, Enrollment,
                               TimetableEntry, Exam, Result, Homework, Fee, FeePayment, Attendance, AttendanceSession, AttendanceRevision, Announcement, AuditEvent)
from school_app.tenancy import school_context
from school_app.curriculum import subjects_for_grade

FIRST = ['Ahmad', 'Hamid', 'Farid', 'Omar', 'Bilal', 'Samiullah', 'Jawad', 'Mustafa', 'Faisal', 'Haroon', 'Zubair', 'Rafiullah', 'Maryam', 'Fatima', 'Amina', 'Zahra', 'Laila', 'Nargis', 'Shabnam', 'Hadia', 'Sahar', 'Rabia', 'Mursal', 'Nadia']
LAST = ['Ahmadi', 'Rahimi', 'Karimi', 'Azizi', 'Noori', 'Safi', 'Wahdat', 'Haidari', 'Sadat', 'Mohammadi', 'Shinwari', 'Amiri']


class Command(BaseCommand):
    help = 'Create a realistic synthetic school (grades 1–12 A/B) without changing existing records or passwords.'

    def add_arguments(self, parser):
        parser.add_argument('--admin', required=True, help='Existing authorized school admin username')
        parser.add_argument('--slug', default='kabul-school')
        parser.add_argument('--name', default='Kabul School')
        parser.add_argument('--students-per-class', type=int, default=12)

    @transaction.atomic
    def handle(self, *args, **options):
        actor = User.objects.filter(username=options['admin'], is_active=True).first()
        if not actor or not (actor.is_superuser or Membership.objects.filter(user=actor, role='admin', is_active=True, school__is_active=True).exists()):
            raise CommandError('Choose an existing active school administrator.')
        if not 4 <= options['students_per_class'] <= 40:
            raise CommandError('Use 4–40 students per class.')
        school, created = School.objects.get_or_create(slug=options['slug'], defaults={'name': options['name'], 'appearance': {'accent':'#285b66', 'demo': True}})
        if not created:
            if not school.appearance.get('demo'):
                raise CommandError('This slug belongs to a non-demo school. No records changed.')
            self.stdout.write('Demo school already exists. Re-running does not duplicate or reset it.')
            return
        Membership.objects.create(user=actor, school=school, role='admin')
        rng = Random(20261016)
        today = timezone.localdate()
        year = str(today.year)
        days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday']
        with school_context(school.pk):
            SchoolSettings.objects.create(school_name=school.name, academic_year=year, address='Kabul, Afghanistan — synthetic demonstration school',
                phone='Demo contacts only', teaching_days=days, grading_scale={'A':90,'B':80,'C':70,'D':60,'E':0})
            classes = [SchoolClass.objects.create(name=f'Class {grade} {section}', grade=str(grade), section=section, academic_year=year, subjects=subjects_for_grade(grade)) for grade in range(1,13) for section in ('A','B')]
            subject_teachers = defaultdict(list)
            accounts = list(User.objects.filter(is_active=True, memberships__role='teacher', memberships__is_active=True).distinct().order_by('pk')[:3])
            all_subjects = {s for c in classes for s in c.subjects}
            ordered_subjects = ['Mathematics','Dari','English'] + sorted(all_subjects - {'Mathematics','Dari','English'})
            for index, subject in enumerate(ordered_subjects):
                for ordinal in range(2):
                    n = index*2+ordinal
                    user = accounts[n] if n < len(accounts) else None
                    teacher = Teacher.objects.create(teacher_id=f'T-{n+1:03d}', name=f'{FIRST[n%len(FIRST)]} {LAST[(n//len(FIRST)+index)%len(LAST)]}', subject=subject,
                        phone_number=f'070000{n+1:04d}', user=user)
                    teacher.assigned_classes.add(*[c for c in classes if subject in c.subjects])
                    subject_teachers[subject].append(teacher)
                    if user:
                        Membership.objects.get_or_create(user=user,school=school,defaults={'role':'teacher'})
            pupils = {}
            for ci, cls in enumerate(classes):
                pupils[cls.pk] = []
                for ordinal in range(options['students_per_class']):
                    seq = ci*options['students_per_class']+ordinal
                    name_index = (ordinal + ci*3) % len(FIRST)
                    student = Student.objects.create(student_id=f'{today.year}-{seq+1:04d}', name=f'{FIRST[name_index]} {LAST[(seq//len(FIRST)+ordinal)%len(LAST)]}',
                        father_name=f'{FIRST[(ordinal+ci)%12]} {LAST[(seq//len(FIRST)+ordinal)%len(LAST)]}', gender='Female' if name_index>=12 else 'Male',
                        date_of_birth=date(today.year-(int(cls.grade)+6), (ordinal%12)+1, min(ordinal+2,28)), school_class=cls,
                        contact_number=f'070000{seq+100:04d}', address=f'{["Khair Khana","Karte Char","Dasht-e-Barchi","Shahr-e-Naw"][ci%4]}, Kabul (demo)')
                    pupils[cls.pk].append(student)
                    Guardian.objects.create(student=student, name=student.father_name, relationship='Father', phone_number=student.contact_number, is_emergency_contact=True)
                    Enrollment.objects.create(student=student,school_class=cls,academic_year=year)
            # A complete six-day sample week. Greedy subject choice avoids staff conflicts.
            subject_counts = defaultdict(int)
            for day in days:
                for period in range(5):
                    used = set()
                    for ci,cls in enumerate(classes):
                        ordered = sorted(cls.subjects, key=lambda s:(subject_counts[(cls.pk,s)], (cls.subjects.index(s)-ci-period)%len(cls.subjects)))
                        for subject in ordered:
                            candidates = [t for t in subject_teachers[subject] if t.pk not in used]
                            if candidates:
                                teacher=candidates[0];used.add(teacher.pk);subject_counts[(cls.pk,subject)]+=1
                                TimetableEntry.objects.create(day=day,start_time=f'{8+period:02d}:00',end_time=f'{8+period:02d}:45',school_class=cls,subject=subject,teacher=teacher)
                                break
                        else:
                            raise CommandError('Could not construct a conflict-free demo timetable.')
            past_days = [today-timedelta(days=i) for i in range(1,9) if (today-timedelta(days=i)).strftime('%A') in days]
            for ci,cls in enumerate(classes):
                teacher=subject_teachers['Mathematics'][ci%2]
                for day in past_days:
                    register=[]
                    for student in pupils[cls.pk]:
                        status=rng.choices(['Present','Absent','Late'],weights=[88,8,4])[0]
                        Attendance.objects.create(student=student,school_class=cls,attendance_date=day,status=status,recorded_by=teacher.user or actor)
                        register.append({'student':student.pk,'status':status,'remarks':''})
                    taken=teacher if teacher.user else None
                    attribution={'actor_name':taken.name if taken else actor.get_full_name() or actor.username,'actor_identifier':taken.teacher_id if taken else actor.username,'actor_role':'teacher' if taken else 'admin'}
                    session=AttendanceSession.objects.create(school_class=cls,attendance_date=day,taken_by=teacher.user or actor,**attribution)
                    AttendanceRevision.objects.create(session=session,revision=1,records=register,reason='Synthetic demonstration register',**attribution)
                    if day == past_days[0]:
                        # Keep the first register as history and show a realistic correction.
                        corrected = [dict(record) for record in register]
                        corrected[0].update(status='Late', remarks='Arrived after the first register (synthetic demo).')
                        Attendance.objects.filter(student_id=corrected[0]['student'], attendance_date=day).update(
                            status='Late', remarks=corrected[0]['remarks'])
                        session.revision = 2
                        session.save(update_fields=['revision'])
                        AttendanceRevision.objects.create(session=session,revision=2,records=corrected,
                            reason='Corrected a late arrival in the synthetic demo',**attribution)
                subjects=[s for s in ['Mathematics','Dari','English','Science','Physics'] if s in cls.subjects][:3]
                exam=Exam.objects.create(name=f'{cls.name} — Monthly Assessment',school_class=cls,subject=subjects[0],subjects=subjects,exam_type='Monthly Test',academic_year=year,exam_date=today-timedelta(days=10),max_marks=100)
                for student in pupils[cls.pk]:
                    for subject in subjects:
                        mark=rng.randint(42,98)
                        Result.objects.create(student=student,exam=exam,subject=subject,marks=mark,total_marks=100,percentage=mark,grade='A' if mark>=90 else 'B' if mark>=80 else 'C' if mark>=70 else 'D' if mark>=60 else 'E')
                Exam.objects.create(name=f'{cls.name} — Term Review',school_class=cls,subject=subjects[0],subjects=subjects,exam_type='Midterm Examination',academic_year=year,exam_date=today+timedelta(days=5),max_marks=100)
                tasks=[('Mathematics','Number practice' if int(cls.grade)<=3 else 'Fractions and equations','Complete exercises 1–8 in your notebook. Show each calculation and bring your work for review.'),('Dari','Reading and writing','Read the assigned passage. Write five complete sentences and underline the new vocabulary.')]
                for subject,title,description in tasks:
                    author=next((t.user for t in subject_teachers[subject] if t.user),actor)
                    Homework.objects.create(title=f'{cls.name}: {title}',description=description,school_class=cls,subject=subject,due_date=today+timedelta(days=2),created_by=author)
                for ordinal,student in enumerate(pupils[cls.pk]):
                    amount=Decimal(800+int(cls.grade)*100)
                    for age in (1,0):
                        month=(today.replace(day=1)-timedelta(days=1)).replace(day=1) if age else today.replace(day=1)
                        due=month.replace(day=10)
                        fee=Fee.objects.create(student=student,school_class=cls,fee_type='Monthly Tuition Fee',academic_year=year,billing_period=month.strftime('%Y-%m'),amount=amount,total_due=amount,remaining_amount=amount,due_date=due,created_by=actor,notes='Synthetic demo invoice; no actual money is due.')
                        paid=amount if ordinal%4==0 or age and ordinal%4==1 else amount/2 if ordinal%4==1 else Decimal(0)
                        if paid:
                            FeePayment.objects.create(fee=fee,amount=paid,payment_date=min(today,due+timedelta(days=1)),payment_method='Cash' if ordinal%2==0 else 'Bank transfer',recorded_by=actor,notes='Synthetic demo payment')
            Announcement.objects.create(title='Demo school: start here',content='All people, contacts, attendance and payments in this workspace are synthetic. Explore a student, take attendance, review a class timetable, enter exam marks and print a fee receipt. No real payment is required.',created_by=actor)
            Announcement.objects.create(title='Staff planning meeting',content='Review the term examination timetable and contact guardians about outstanding invoices.',created_by=actor,audience='Teachers')
            AuditEvent.objects.create(actor=actor,school=school,action='realistic_demo_created',target=f'24-classes:{sum(len(v) for v in pupils.values())}-students')
            counts={'classes':SchoolClass.objects.count(),'students':Student.objects.count(),'teachers':Teacher.objects.count(),'lessons':TimetableEntry.objects.count(),'exams':Exam.objects.count(),'results':Result.objects.count(),'homework':Homework.objects.count(),'invoices':Fee.objects.count(),'payments':FeePayment.objects.count()}
        self.stdout.write(self.style.SUCCESS(f'Demo created: {school.slug}. {counts}. Existing records and passwords were preserved. Sign out/in to refresh school memberships.'))
