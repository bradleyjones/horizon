# Copyright 2012 United States Government as represented by the
# Administrator of the National Aeronautics and Space Administration.
# All Rights Reserved.
#
# Copyright 2012 Nebula, Inc.
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.

from copy import deepcopy  # noqa

from django.core.urlresolvers import reverse
from django import http
from mox import IsA  # noqa

from horizon.workflows import views
from openstack_dashboard import api
from openstack_dashboard.dashboards.project.access_and_security \
    import api_access
from openstack_dashboard.dashboards.project.access_and_security \
    .security_groups import tables
from openstack_dashboard.test import helpers as test
from openstack_dashboard.usage import quotas

INDEX_URL = reverse('horizon:project:access_and_security:index')


class AccessAndSecurityTests(test.TestCase):
    def setUp(self):
        super(AccessAndSecurityTests, self).setUp()

    def test_index(self):
        keypairs = self.keypairs.list()
        sec_groups = self.security_groups.list()
        floating_ips = self.floating_ips.list()
        quota_data = self.quota_usages.first()
        neutron_quota = self.neutron_quotas.first()

        self.mox.StubOutWithMock(api.network, 'floating_ip_supported')
        self.mox.StubOutWithMock(api.network, 'tenant_floating_ip_list')
        self.mox.StubOutWithMock(api.network, 'security_group_list')
        self.mox.StubOutWithMock(api.neutron, 'tenant_quota_get')
        self.mox.StubOutWithMock(api.nova, 'keypair_list')
        self.mox.StubOutWithMock(api.nova, 'server_list')
        self.mox.StubOutWithMock(quotas, 'tenant_quota_usages')
        self.mox.StubOutWithMock(api.base, 'is_service_enabled')

        api.nova.server_list(IsA(http.HttpRequest)) \
            .AndReturn([self.servers.list(), False])
        api.nova.keypair_list(IsA(http.HttpRequest)).AndReturn(keypairs)
        api.network.floating_ip_supported(IsA(http.HttpRequest)) \
            .AndReturn(True)
        api.network.tenant_floating_ip_list(IsA(http.HttpRequest)) \
            .AndReturn(floating_ips)
        api.network.security_group_list(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(sec_groups)
        api.neutron.tenant_quota_get(IsA(http.HttpRequest), self.tenant.id)\
            .MultipleTimes().AndReturn(neutron_quota)
        quotas.tenant_quota_usages(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(quota_data)

        api.base.is_service_enabled(IsA(http.HttpRequest),
                                    'network').MultipleTimes().AndReturn(True)
        api.base.is_service_enabled(IsA(http.HttpRequest),
                                    'ec2').MultipleTimes().AndReturn(True)

        self.mox.ReplayAll()

        res = self.client.get(INDEX_URL)

        self.assertTemplateUsed(res, 'project/access_and_security/index.html')
        self.assertItemsEqual(res.context['keypairs_table'].data, keypairs)
        self.assertItemsEqual(res.context['security_groups_table'].data,
                              sec_groups)
        self.assertItemsEqual(res.context['floating_ips_table'].data,
                              floating_ips)
        self.assertTrue(any(map(
            lambda x: isinstance(x, api_access.tables.DownloadEC2),
            res.context['endpoints_table'].get_table_actions()
        )))

    def test_index_with_ec2_disabled(self):
        keypairs = self.keypairs.list()
        sec_groups = self.security_groups.list()
        floating_ips = self.floating_ips.list()
        quota_data = self.quota_usages.first()
        neutron_quota = self.neutron_quotas.first()

        self.mox.StubOutWithMock(api.network, 'floating_ip_supported')
        self.mox.StubOutWithMock(api.network, 'tenant_floating_ip_list')
        self.mox.StubOutWithMock(api.network, 'security_group_list')
        self.mox.StubOutWithMock(api.neutron, 'tenant_quota_get')
        self.mox.StubOutWithMock(api.nova, 'keypair_list')
        self.mox.StubOutWithMock(api.nova, 'server_list')
        self.mox.StubOutWithMock(quotas, 'tenant_quota_usages')
        self.mox.StubOutWithMock(api.base, 'is_service_enabled')

        api.nova.server_list(IsA(http.HttpRequest)) \
            .AndReturn([self.servers.list(), False])
        api.nova.keypair_list(IsA(http.HttpRequest)).AndReturn(keypairs)
        api.network.floating_ip_supported(IsA(http.HttpRequest)) \
            .AndReturn(True)
        api.network.tenant_floating_ip_list(IsA(http.HttpRequest)) \
            .AndReturn(floating_ips)
        api.network.security_group_list(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(sec_groups)
        api.neutron.tenant_quota_get(IsA(http.HttpRequest), self.tenant.id)\
            .MultipleTimes().AndReturn(neutron_quota)
        quotas.tenant_quota_usages(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(quota_data)

        api.base.is_service_enabled(IsA(http.HttpRequest),
                                    'network').MultipleTimes().AndReturn(True)
        api.base.is_service_enabled(IsA(http.HttpRequest),
                                    'ec2').MultipleTimes().AndReturn(False)

        self.mox.ReplayAll()

        res = self.client.get(INDEX_URL)

        self.assertTemplateUsed(res, 'project/access_and_security/index.html')
        self.assertItemsEqual(res.context['keypairs_table'].data, keypairs)
        self.assertItemsEqual(res.context['security_groups_table'].data,
                              sec_groups)
        self.assertItemsEqual(res.context['floating_ips_table'].data,
                              floating_ips)
        self.assertFalse(any(map(
            lambda x: isinstance(x, api_access.tables.DownloadEC2),
            res.context['endpoints_table'].get_table_actions()
        )))

    def test_association(self):
        servers = [api.nova.Server(s, self.request)
                   for s in self.servers.list()]
        # Add duplicate instance name to test instance name with [ID]
        # Change id and private IP
        server3 = api.nova.Server(self.servers.first(), self.request)
        server3.id = 101
        server3.addresses = deepcopy(server3.addresses)
        server3.addresses['private'][0]['addr'] = "10.0.0.5"
        servers.append(server3)

        targets = [api.nova.FloatingIpTarget(s) for s in servers]

        self.mox.StubOutWithMock(api.network, 'tenant_floating_ip_list')
        self.mox.StubOutWithMock(api.network, 'floating_ip_target_list')
        api.network.tenant_floating_ip_list(IsA(http.HttpRequest)) \
                .AndReturn(self.floating_ips.list())
        api.network.floating_ip_target_list(IsA(http.HttpRequest)) \
                .AndReturn(targets)
        self.mox.ReplayAll()

        res = self.client.get(reverse("horizon:project:access_and_security:"
                                      "floating_ips:associate"))
        self.assertTemplateUsed(res, views.WorkflowView.template_name)

        self.assertContains(res,
                            '<option value="1">server_1 (1)</option>')
        self.assertContains(res,
                            '<option value="101">server_1 (101)</option>')
        self.assertContains(res, '<option value="2">server_2 (2)</option>')


class AccessAndSecurityNeutronProxyTests(AccessAndSecurityTests):
    def setUp(self):
        super(AccessAndSecurityNeutronProxyTests, self).setUp()
        self.floating_ips = self.floating_ips_uuid


class SecurityGroupTabTests(test.TestCase):
    def setUp(self):
        super(SecurityGroupTabTests, self).setUp()

    def _test_create_button_disabled_when_quota_exceeded(self):
        keypairs = self.keypairs.list()
        floating_ips = self.floating_ips.list()
        floating_pools = self.pools.list()
        quota_data = self.quota_usages.first()
        sec_groups = self.security_groups.list()

        self.mox.StubOutWithMock(api.network, 'floating_ip_supported')
        self.mox.StubOutWithMock(api.network, 'tenant_floating_ip_list')
        self.mox.StubOutWithMock(api.network, 'security_group_list')
        self.mox.StubOutWithMock(api.network, 'floating_ip_pools_list')
        self.mox.StubOutWithMock(api.nova, 'keypair_list')
        self.mox.StubOutWithMock(api.nova, 'server_list')
        self.mox.StubOutWithMock(quotas, 'tenant_quota_usages')

        api.network.floating_ip_supported(IsA(http.HttpRequest)) \
            .AndReturn(True)
        api.network.tenant_floating_ip_list(IsA(http.HttpRequest)) \
            .AndReturn(floating_ips)
        api.network.security_group_list(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(sec_groups)
        api.network.floating_ip_pools_list(IsA(http.HttpRequest)) \
            .AndReturn(floating_pools)
        api.nova.keypair_list(IsA(http.HttpRequest)).AndReturn(keypairs)
        api.nova.server_list(IsA(http.HttpRequest)) \
            .AndReturn([self.servers.list(), False])
        quotas.tenant_quota_usages(IsA(http.HttpRequest)).MultipleTimes()\
            .AndReturn(quota_data)

        api.base.is_service_enabled(IsA(http.HttpRequest),
                                    'ec2').MultipleTimes().AndReturn(False)

        self.mox.ReplayAll()

        res = self.client.get(INDEX_URL +
                "?tab=access_security_tabs__security_groups_tab")

        security_groups = res.context['security_groups_table'].data
        self.assertItemsEqual(security_groups, self.security_groups.list())

        create_link = tables.CreateGroup()
        url = create_link.get_link_url()
        classes = list(create_link.get_default_classes())\
                    + list(create_link.classes)
        link_name = "%s (%s)" % (unicode(create_link.verbose_name),
                                 "Quota exceeded")
        expected_string = "<a href='%s' title='%s'  class='%s disabled' "\
            "id='security_groups__action_create'>" \
            "<span class='glyphicon glyphicon-plus'></span>%s</a>" \
            % (url, link_name, " ".join(classes), link_name)
        self.assertContains(res, expected_string, html=True,
                            msg_prefix="The create button is not disabled")

    def test_create_button_disabled_when_quota_exceeded_neutron_disabled(self):
        tenant_quotas = api.base.QuotaSet()
        tenant_quotas['security_groups'] = 0

        self.mox.StubOutWithMock(api.nova, 'tenant_quota_get')
        self.mox.StubOutWithMock(api.base, 'is_service_enabled')

        api.nova.tenant_quota_get(
            IsA(http.HttpRequest),
            self.tenant.id).MultipleTimes()\
            .AndReturn(tenant_quotas)

        api.base.is_service_enabled(IsA(http.HttpRequest),
                            'network').MultipleTimes().AndReturn(False)

        self._test_create_button_disabled_when_quota_exceeded()

    def test_create_button_disabled_when_quota_exceeded_neutron_enabled(self):
        tenant_quotas = api.base.QuotaSet()
        tenant_quotas['security_group'] = 0

        self.mox.StubOutWithMock(api.neutron, 'tenant_quota_get')
        self.mox.StubOutWithMock(api.base, 'is_service_enabled')

        api.neutron.tenant_quota_get(
            IsA(http.HttpRequest),
            self.tenant.id).MultipleTimes()\
            .AndReturn(tenant_quotas)

        api.base.is_service_enabled(IsA(http.HttpRequest),
                            'network').MultipleTimes().AndReturn(True)

        self._test_create_button_disabled_when_quota_exceeded()
