# vim: tabstop=4 shiftwidth=4 softtabstop=4

# Copyright 2012 United States Government as represented by the
# Administrator of the National Aeronautics and Space Administration.
# All Rights Reserved.
#
# Copyright 2013 NTT MCL Inc.
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

import json

from django.core.urlresolvers import reverse
from django.http import HttpResponse
from django.views.generic import TemplateView
from django.views.generic import View

from openstack_dashboard import api


class NetworkTopology(TemplateView):
    template_name = 'project/network_topology/index.html'


class JSONView(View):
    def add_resource_url(self, view, resources):
        tenant_id = self.request.user.tenant_id
        for resource in resources:
            if (resource.get('tenant_id')
                    and tenant_id != resource.get('tenant_id')):
                continue
            resource['url'] = reverse(view, None, [str(resource['id'])])

    def _check_router_external_port(self, ports, router_id, network_id):
        for port in ports:
            if (port['network_id'] == network_id
                    and port['device_id'] == router_id):
                return True
        return False

    def get(self, request, *args, **kwargs):
        data = {}
        # Get nova data
        try:
            novaclient = api.nova.novaclient(request)
            servers = novaclient.servers.list()
        except:
            servers = []
        data['servers'] = [{'name': server.name,
                            'status': server.status,
                            'id': server.id} for server in servers]
        self.add_resource_url('horizon:project:instances:detail',
                              data['servers'])

        # Get quantum data
        try:
            quantumclient = api.quantum.quantumclient(request)
            quantumnetworks = quantumclient.list_networks().get('networks', [])
            subnets = quantumclient.list_subnets().get('subnets', [])
            ports = quantumclient.list_ports().get('ports', [])
            quantumrouters = quantumclient.list_routers().get('routers', [])
        except:
            quantumnetworks = []
            subnets = []
            ports = []
            quantumrouters = []

        networks = []
        for net in quantumnetworks:
            if (net['router:external'] is True or
                        net['shared'] is True or
                        net['tenant_id'] == request.user.tenant_id):
                networks.append(net)

        routers = [rout for rout in quantumrouters if
                    rout['tenant_id'] == request.user.tenant_id]

        data['networks'] = sorted(networks,
                                  key=lambda x: x.get('router:external'),
                                  reverse=True)
        self.add_resource_url('horizon:project:networks:detail',
                              data['networks'])

        data['subnets'] = subnets
        data['ports'] = ports
        self.add_resource_url('horizon:project:networks:ports:detail',
                              data['ports'])
        data['routers'] = routers
        # user can't see port on external network. so we are
        # adding fake port based on router information
        for router in data['routers']:
            external_gateway_info = router.get('external_gateway_info')
            if not external_gateway_info:
                continue
            external_network = external_gateway_info.get(
                'network_id')
            if not external_network:
                continue
            if self._check_router_external_port(data['ports'],
                                                router['id'],
                                                external_network):
                continue
            fake_port = {'id': 'fake%s' % external_network,
                         'network_id': external_network,
                         'device_id': router['id'],
                         'fixed_ips': []}
            data['ports'].append(fake_port)

        self.add_resource_url('horizon:project:routers:detail',
                              data['routers'])
        json_string = json.dumps(data, ensure_ascii=False)
        return HttpResponse(json_string, mimetype='text/json')
