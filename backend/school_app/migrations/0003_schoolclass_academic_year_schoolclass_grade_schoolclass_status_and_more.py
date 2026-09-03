from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('school_app', '0002_alter_attendance_unique_together_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='schoolclass',
            name='academic_year',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='schoolclass',
            name='grade',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='schoolclass',
            name='status',
            field=models.CharField(choices=[('Active', 'Active'), ('Inactive', 'Inactive')], default='Active', max_length=20),
        ),
        migrations.AlterUniqueTogether(
            name='schoolclass',
            unique_together={('name', 'grade', 'academic_year')},
        ),
    ]
