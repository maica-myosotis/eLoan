from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applicant', '0006_applicantprofile_extended_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='member',
            name='subscribed_shares',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text='Number of shares subscribed. Minimum: 20 (By-Laws Section 3c & 6).',
            ),
        ),
        migrations.AddField(
            model_name='member',
            name='paid_shares',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text='Number of shares paid up. Minimum: 5 (By-Laws Section 3c & 6).',
            ),
        ),
    ]
