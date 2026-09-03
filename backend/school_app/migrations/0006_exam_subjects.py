from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('school_app', '0005_feepayment_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='exam',
            name='subjects',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
