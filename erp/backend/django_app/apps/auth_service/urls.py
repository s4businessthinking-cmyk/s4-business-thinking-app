from django.urls import path

from apps.auth_service.views import LoginView, LogoutView, MeView, RefreshView, RevokeSessionView, SessionsView

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/sessions/", SessionsView.as_view(), name="auth-sessions"),
    path("auth/sessions/revoke/", RevokeSessionView.as_view(), name="auth-sessions-revoke"),
]
