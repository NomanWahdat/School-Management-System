"""Editable starting templates based on the MoE's published textbook catalogue.

Source: https://moe.gov.af/dr/node/450 . Schools approve their own subject plan;
these templates are not a claim about every current school's required syllabus.
"""
SOURCE = 'https://moe.gov.af/dr/node/450'


def subjects_for_grade(grade):
    grade = int(grade)
    if grade <= 3:
        return ['Dari', 'Mathematics', 'Holy Quran', 'Islamic Studies', 'Life Skills', 'Art', 'Calligraphy']
    if grade <= 6:
        return ['Dari', 'Pashto', 'Mathematics', 'Holy Quran', 'Islamic Studies', 'Science', 'Social Studies', 'English', 'Art', 'Calligraphy']
    subjects = ['Dari', 'Pashto', 'Mathematics', 'Islamic Studies', 'Biology', 'Physics', 'Chemistry', 'History', 'Geography', 'Civic Education', 'English']
    if grade <= 9:
        subjects += ['Arabic', 'Art']
        if grade in (7, 9):
            subjects += ['Vocational Studies', 'Tajweed', 'Patriotism']
    else:
        subjects += ['Tafsir', 'Computer Studies']
        if grade == 10:
            subjects += ['Geology']
    return subjects
