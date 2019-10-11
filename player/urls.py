from django.conf.urls import url

from . import views

urlpatterns = [
    url(r'^$', views.index, name='index'),
    url(r'^player$', views.player, name='player'),
    url(r'^logout$', views.logout, name='index'),
]