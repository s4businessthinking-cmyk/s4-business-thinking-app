from django.urls import path

from apps.accounting.views import (
    AccountListView,
    FiscalPeriodListView,
    GeneralLedgerListView,
    JournalListCreateView,
    JournalPostView,
    TrialBalanceView,
)

urlpatterns = [
    path("accounting/accounts/", AccountListView.as_view(), name="accounting-accounts"),
    path("accounting/periods/", FiscalPeriodListView.as_view(), name="accounting-periods"),
    path("accounting/journals/", JournalListCreateView.as_view(), name="accounting-journals"),
    path("accounting/journals/<uuid:journal_id>/post/", JournalPostView.as_view(), name="accounting-journal-post"),
    path("accounting/gl/", GeneralLedgerListView.as_view(), name="accounting-gl"),
    path("accounting/trial-balance/", TrialBalanceView.as_view(), name="accounting-trial-balance"),
]
