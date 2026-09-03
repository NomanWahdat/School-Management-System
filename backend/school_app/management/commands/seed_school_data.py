from datetime import date

from django.core.management.base import BaseCommand

from school_app.models import SchoolClass, Student, Teacher, User


class Command(BaseCommand):
    help = 'Seed the system with 10 classes, 10 teachers, and 100 students.'

    def handle(self, *args, **options):
        Teacher.objects.all().delete()
        Student.objects.all().delete()
        SchoolClass.objects.all().delete()
        User.objects.filter(role='teacher').delete()

        class_names = [f'Class {i}' for i in range(1, 11)]
        class_map = {}

        for name in class_names:
            school_class, _ = SchoolClass.objects.get_or_create(name=name)
            class_map[name] = school_class

        teacher_names = [
            'Aisha Rahimi',
            'Farid Ahmad',
            'Hadiullah Khan',
            'Nadia Sadiq',
            'Omar Zia',
            'Samira Noori',
            'Yousef Hakimi',
            'Laila Niazi',
            'Mujtaba Safi',
            'Zarghona Ehsan',
        ]

        teacher_assignments = {
            1: ['Class 1', 'Class 2', 'Class 3'],
            2: ['Class 2', 'Class 3', 'Class 4'],
            3: ['Class 4', 'Class 5', 'Class 6'],
            4: ['Class 5', 'Class 6', 'Class 7'],
            5: ['Class 7', 'Class 8', 'Class 9'],
            6: ['Class 8', 'Class 9', 'Class 10'],
            7: ['Class 1', 'Class 5', 'Class 9'],
            8: ['Class 2', 'Class 6', 'Class 10'],
            9: ['Class 3', 'Class 7', 'Class 9'],
            10: ['Class 4', 'Class 8', 'Class 10'],
        }

        first_names = [
            'Ahmad', 'Ali', 'Hamza', 'Noor', 'Sara', 'Maryam', 'Bilal', 'Amina', 'Zain', 'Hassan',
            'Imran', 'Rayan', 'Layla', 'Yasir', 'Nora', 'Omar', 'Ariana', 'Saif', 'Fatiha', 'Waleed',
            'Mina', 'Ehsan', 'Sami', 'Aisha', 'Nabi', 'Khalid', 'Lina', 'Jamal', 'Nadia', 'Zaki',
            'Aziz', 'Huda', 'Basir', 'Sahar', 'Tariq', 'Rosa', 'Arman', 'Mariam', 'Dawood', 'Samina',
            'Junaid', 'Hafsa', 'Kamal', 'Dania', 'Qasim', 'Areeba', 'Rafi', 'Zahra', 'Farhan', 'Musa',
            'Sajjad', 'Sana', 'Ibrahim', 'Parisa', 'Adnan', 'Mahdi', 'Nila', 'Hameed', 'Shams', 'Aroosa',
        ]

        last_names = [
            'Rahimi', 'Ahmadzai', 'Khan', 'Hakimi', 'Sadiq', 'Noori', 'Niazi', 'Ehsan', 'Momand', 'Qader',
            'Waziri', 'Farooqi', 'Zai', 'Karimi', 'Safi', 'Tariq', 'Gul', 'Hussain', 'Yar', 'Nabizada',
            'Haq', 'Shah', 'Sultan', 'Safi', 'Rahman', 'Mangal', 'Zada', 'Jamal', 'Sultani', 'Amini',
        ]

        for idx, teacher_name in enumerate(teacher_names, start=1):
            username = f'teacher{idx:02d}'
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': f'{username}@school.local',
                    'role': 'teacher',
                    'is_staff': True,
                    'is_superuser': False,
                },
            )
            if not user.check_password('teacherpass123'):
                user.set_password('teacherpass123')
                user.save(update_fields=['password'])

            teacher, _ = Teacher.objects.get_or_create(
                teacher_id=f'T-{idx:03d}',
                defaults={
                    'user': user,
                    'name': teacher_name,
                    'phone_number': f'070{idx:08d}',
                    'subject': ['Mathematics', 'Science', 'English', 'Physics', 'History', 'Computer', 'Biology', 'Geography', 'Art', 'Chemistry'][idx - 1],
                    'status': 'Active',
                },
            )
            teacher.user = user
            teacher.phone_number = f'070{idx:08d}'
            teacher.status = 'Active'
            teacher.save()
            assigned = [class_map[name] for name in teacher_assignments[idx]]
            teacher.assigned_classes.set(assigned)

        for class_index, class_name in enumerate(class_names, start=1):
            school_class = class_map[class_name]
            for student_number in range(1, 11):
                first_name = first_names[(class_index * student_number + 3) % len(first_names)]
                last_name = last_names[(class_index * student_number + 5) % len(last_names)]
                student_id = f'S-{(class_index - 1) * 10 + student_number:03d}'
                gender = 'Male' if (student_number + class_index) % 2 == 0 else 'Female'
                birth_year = 2012 + ((class_index + student_number) % 5)
                birth_date = date(birth_year, (student_number % 12) + 1, (student_number * 2) % 28 + 1)

                Student.objects.get_or_create(
                    student_id=student_id,
                    defaults={
                        'name': f'{first_name} {last_name}',
                        'father_name': f'{last_name} {first_name}',
                        'gender': gender,
                        'date_of_birth': birth_date,
                        'school_class': school_class,
                        'contact_number': f'079{(class_index * 1000 + student_number):08d}'[:10],
                        'address': f'{class_name} area, Kabul',
                        'fee_status': ['Paid', 'Partially Paid', 'Pending'][student_number % 3],
                        'is_active': True,
                    },
                )

        self.stdout.write(self.style.SUCCESS('Seeded 10 classes, 10 teachers, and 100 students.'))
