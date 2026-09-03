from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('school_app', '0006_exam_subjects'),
    ]

    operations = [
        migrations.AddField(
            model_name='schoolclass',
            name='subjects',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='exam',
            name='exam_type',
            field=models.CharField(
                choices=[
                    ('Monthly Test', 'Monthly Test'),
                    ('Four-and-a-Half-Month Examination', 'Four-and-a-Half-Month Examination'),
                    ('Annual Examination', 'Annual Examination'),
                    ('Midterm Examination', 'Midterm Examination'),
                    ('Final Examination', 'Final Examination'),
                    ('Other', 'Other'),
                ],
                default='Monthly Test',
                max_length=40,
            ),
        ),
    ]
