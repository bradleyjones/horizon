function Network(data) {
  for (key in data) {
    this[key] = data[key];
  }
  this.iconType = 'text';
  this.icon = '\uf0c2'; // Cloud
  this.collapsed = false;
}

function ExternalNetwork(data) {
  for (key in data) {
    this[key] = data[key];
  }
  this.iconType = 'text';
  this.icon = '\uf0ac'; // Globe
}

function Router(data) {
  for (key in data) {
    this[key] = data[key];
  }
  this.iconType = 'path'
  this.svg = "router";
}

function Server(data, networks) {
  for (key in data) {
    this[key] = data[key];
  }
  this.iconType = 'text';
  this.icon = '\uf108'; // Server
  this.networks = [];
}

horizon.network_topology = {
  model: null,
  fa_globe_glyph: '\uf0ac',
  fa_globe_glyph_width: 15,
  svg:'#topology_canvas',
  nodes: [],
  links: [],
  data: [],
  zoom: d3.behavior.zoom(),
  svg_container:'#topologyCanvasContainer',
  balloon_tmpl : null,
  balloon_device_tmpl : null,
  balloon_port_tmpl : null,
  network_index: {},
  balloon_id:null,
  reload_duration: 10000,
  draw_mode:'normal',
  network_height : 0,
  previous_message : null,
  element_properties:{
    normal:{
      network_width:270,
      network_min_height:500,
      top_margin:80,
      default_height:50,
      margin:20,
      device_x:98.5,
      device_width:90,
      port_margin:16,
      port_height:6,
      port_width:82,
      port_text_margin:{x:6,y:-4},
      texts_bg_y:32,
      type_y:46,
      balloon_margin:{x:12,y:-12}
    },
    small :{
      network_width:100,
      network_min_height:400,
      top_margin:50,
      default_height:20,
      margin:30,
      device_x:47.5,
      device_width:20,
      port_margin:5,
      port_height:3,
      port_width:32.5,
      port_text_margin:{x:0,y:0},
      texts_bg_y:0,
      type_y:0,
      balloon_margin:{x:12,y:-30}
    },
    cidr_margin:5,
    device_name_max_size:9,
    device_name_suffix:'..'
  },


  init:function(){
    var self = this;

    // Setup balloon popups
    self.balloon_tmpl = Hogan.compile($('#balloon_container').html());
    self.balloon_device_tmpl = Hogan.compile($('#balloon_device').html());
    self.balloon_port_tmpl = Hogan.compile($('#balloon_port').html());

    $(document)
      .on('click', 'a.closeTopologyBalloon', function(e) {
        e.preventDefault();
        self.delete_balloon();
      })
      .on('click', '.topologyBalloon', function(e) {
        e.stopPropagation();
      })
      .on('click', 'a.vnc_window', function(e) {
        e.preventDefault();
        var vnc_window = window.open($(this).attr('href'), vnc_window, 'width=760,height=560');
        self.delete_balloon();
      })
      .click(function(){
        self.delete_balloon();
      });

    $('#toggle_labels').click(function(){
      if ($('.nodeLabel').css('display') == 'none') {
        $('.nodeLabel').show()
        horizon.cookies.put('topology_labels', true);
      } else {
        $('.nodeLabel').hide()
        horizon.cookies.put('topology_labels', false);
      }
    });

    $('#toggle_networks').click(function(){
      for (n in self.nodes) {
        self.collapse_network(self.nodes[n]);
      }
      var current = horizon.cookies.get('topology_networks')
      horizon.cookies.put('topology_networks', !current);
    });

    $("#topologyCanvasContainer").spin(horizon.conf.spinner_options.modal);
    self.retrieve_network_info();
  },

  // Get the json data about the current deployment
  retrieve_network_info: function(){
    var self = this;
    $.getJSON($('#networktopology').data('networktopology') + '?' + $.now(),
      function(data) {
        self.create_vis();
        self.force_direction(0.05,70,-700);
        self.load_topology(data);
        self.load_config();
        self.force.start();
      }
    );
  },

  // Load config from cookie
  load_config: function() {
    var labels = horizon.cookies.get('topology_labels');
    var networks = horizon.cookies.get('topology_networks');
    if (labels) {
      $('.nodeLabel').show();
      $('#toggle_labels').addClass('active');
    }
    if (networks) {
      for (n in this.nodes) {
        this.collapse_network(this.nodes[n]);
      }
      $('#toggle_networks').addClass('active');
    }
  },

  // Setup the main visualisation
  create_vis: function(){
    var self = this;
    $("#topologyCanvasContainer").html('');

    // Main svg
    self.outer_group = d3.select("#topologyCanvasContainer").append("svg")
      .attr("width", "100%")
      .attr("height", "700")
      .attr("pointer-events", "all")
      .append("g")
      .call(self.zoom
        .scaleExtent([0.1,1.5])
        .on("zoom", function(){
            self.vis.attr("transform", "translate("+d3.event.translate+")scale("+
              self.zoom.scale()+")")
          })
        );

    // Background for capturing mouse events
    self.outer_group.append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "white");

    // svg wrapper for nodes to sit on
    self.vis = self.outer_group.append("g");
  },

  // Calculate the hulls that surround networks
  convex_hulls: function(nodes){
    var hulls = {};
    var networkids = {};
    var k = 0;
    var offset = 40;

    while( k < nodes.length){
      var n = nodes[k];
      if (n.data instanceof Server){
        var net, _i, _len, _ref, _h;
        _ref = n.data.networks;
        for (_i = 0, _len = _ref.length; _i < _len; _i++){
          net = _ref[_i];
          _h = hulls[net.id] || (hulls[net.id] = []);
          _h.push([n.x - offset, n.y - offset]);
          _h.push([n.x - offset, n.y + offset]);
          _h.push([n.x + offset, n.y - offset]);
          _h.push([n.x + offset, n.y + offset]);
        }
      } else if (n.data instanceof Network){
        var _h;
        var net = n.data;
        networkids[net.id] = n
        _h = hulls[net.id] || (hulls[net.id] = []);
        _h.push([n.x - offset, n.y - offset]);
        _h.push([n.x - offset, n.y + offset]);
        _h.push([n.x + offset, n.y - offset]);
        _h.push([n.x + offset, n.y + offset]);

      }
      ++k;
    }
    var hullset = [];
    for (i in hulls){
      hullset.push({group: i, network: networkids[i], path: d3.geom.hull(hulls[i])});
    }

    return hullset;
  },

  // Setup the force direction
  force_direction: function(grav, linkdist, ch){
    var self = this;

    $('[data-toggle="tooltip"]').tooltip({container: 'body'});
    self.curve = d3.svg.line()
      .interpolate("cardinal-closed")
      .tension(.85);
    self.fill = d3.scale.category10();

    self.force = d3.layout.force()
      .gravity(grav)
      .linkDistance(linkdist)
      .charge(ch)
      .size([$("#topologyCanvasContainer").width(),$("#topologyCanvasContainer").height()])
      .nodes(self.nodes)
      .links(self.links)
      .on("tick", function(e){
        self.vis.selectAll("g.node")
          .attr("transform", function(d){
            return "translate("+d.x+","+d.y+")";
          })

        self.vis.selectAll("line.link")
          .attr("x1", function(d){ return d.source.x; })
          .attr("y1", function(d){ return d.source.y; })
          .attr("x2", function(d){ return d.target.x; })
          .attr("y2", function(d){ return d.target.y; })

        self.vis.selectAll("path.hulls")
          .data(self.convex_hulls(self.vis.selectAll("g.node").data()))
            .attr("d", function(d){
              return self.curve(d.path);
            })
          .enter().insert("path", "g")
            .attr("class", "hulls")
            .style("fill", function(d){
              return self.fill(d.group);
            })
            .style("stroke", function(d){
              return self.fill(d.group);
            })
            .style("stroke-linejoin", "round")
            .style("stroke-width", 10)
            .style("opacity", .2);
      });
  },

  // Create a new node
  new_node: function(data){
    var self = this;
    var data = {data: data};
    self.nodes.push(data);

    var node = self.vis.selectAll("g.node").data(self.nodes);
    var node_enter = node.enter().append("g")
      .attr("class", "node")
      .style("fill", "white")
      .call(self.force.drag)
      .on("dblclick", function(d){
        //window.location = d.data.url;
        if(d.data instanceof Network){
          filter_node = function(obj){
            return function(d, i){
              return obj === d.data;
            }
          }
        if(!d.data.collapsed){
          var vmCount = 0;
        }

        }
      });

    node_enter.append("circle")
      .attr('class', 'frame')
      .attr("r", function(d){
        switch(Object.getPrototypeOf(d.data)){
          case ExternalNetwork.prototype:
            return 35;
          case Network.prototype:
            return 30;
          case Router.prototype:
            return 25;
          case Server.prototype:
            return 20;
        }
      })
      .style("fill", "white")
      .style("stroke", "black")
      .style("stroke-width", 3);

    switch( data.data.iconType ) {
      case 'text':
        node_enter.append('text')
          .style("fill", "black")
          .style('font', '20px FontAwesome')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .text(function(d){ return d.data.icon })
          .attr("transform", function(d){
            switch(Object.getPrototypeOf(d.data)){
              case ExternalNetwork.prototype:
                return "scale(2.5)";
              case Network.prototype:
                return "scale(1.5)";
              case Router.prototype:
                return "scale(1.2)";
              case Server.prototype:
                return "scale(1)";
            }
          });
        break;
      case 'path':
        node_enter.append("path")
          .attr("class", "svgpath")
          .style("fill", "black")
          .attr("d", function(d){ return self.svgs(d.data.svg); })
          .attr("transform", function(d){
            switch(Object.getPrototypeOf(d.data)){
              case ExternalNetwork.prototype:
                return "scale(2)translate(-16,-16)";
              case Network.prototype:
                return "scale(1.5)translate(-16,-16)";
              case Router.prototype:
                return "scale(1.2)translate(-16,-15)";
              case Server.prototype:
                return "scale(1)translate(-16,-16)";
            }
          });
        break;
      }

    node_enter.append("text")
      .attr("class", "nodeLabel")
      .style("display",function() {
        var labels = horizon.cookies.get('topology_labels');
        if (labels) {
          return 'inline';
        } else {
          return "none";
        }
      })
      .style("fill","black")
      .text(function(d) {
        return d.data.name;
      })
      .attr("transform", function(d){
        switch(Object.getPrototypeOf(d.data)){
          case ExternalNetwork.prototype:
            return "translate(40,3)";
          case Network.prototype:
            return "translate(35,3)";
          case Router.prototype:
            return "translate(30,3)";
          case Server.prototype:
            return "translate(25,3)";
        }
      });

    if (data.data instanceof Network) {
      node_enter.append("svg:text")
        .attr("class","vmCount")
        .style("fill", "black")
        .style("font-size","20")
        .text("")
        .attr("transform", "translate(26,38)")
    }

    node_enter.on('mouseenter', function(d) {
      if ((Object.getPrototypeOf(d.data) == Router.prototype) || (Object.getPrototypeOf(d.data) == Server.prototype)) {
        var $this = $(this);
        self.show_balloon(d.data,$this);
      }
    });

    node_enter.on("dblclick", function(d) {
      if (Object.getPrototypeOf(d.data) == Network.prototype) {
        self.collapse_network(d);
      }
    });
  },

  collapse_network: function(d) {
    var self = this;

    var filterNode = function(obj) {
      return function(d, i) {
        return obj == d.data;
      }
    }

    if (!d.data.collapsed) {
      var vmCount = 0;
        for (vm in self.data['servers']) {
          if (self.data['servers'][vm].networks.length == 1) {
            if (self.data['servers'][vm].networks[0] == d.data) {
              vmCount += 1
              self.removeNode(self.data['servers'][vm])
              d.data.collapsed = true
            }
          }
        }
        if (vmCount > 0) {
          self.vis.selectAll(".vmCount").filter(filterNode(d.data))[0][0].textContent = vmCount;
        }
      } else {
        var attr, attrs, vm, _i, _j, _len, _len1, _ref;

        for (server in self.data['servers']) {
          vm = self.data['servers'][server];
          if (vm.networks.length === 1) {
            if (vm.networks[0] === d.data) {
              self.new_node(vm);//, false, d.x, d.y);
              self.new_link(self.find_by_id(vm.id), self.find_by_id(d.data.id));
              self.force.start();
              d.data.collapsed = false;
            }
          }
        }
        self.vis.selectAll(".vmCount").filter(filterNode(d.data))[0][0].textContent = "";
      }
  },

  new_link: function(source, target){
    var self = this;
    self.links.push({source: source, target: target})
    var line = self.vis.selectAll("line.link").data(self.links);
    line.enter().insert("line", "g.node")
      .attr("class", "link")
      .attr("x1", function(d){ return d.source.x; })
      .attr("y1", function(d){ return d.source.y; })
      .attr("x2", function(d){ return d.target.x; })
      .attr("y2", function(d){ return d.target.y; })
      .style("stroke", "black")
      .style("stroke-width", 2);
  },

  find_by_id: function(id) {
    var self = this;
    var obj, _i, _len, _ref, _node;
    _ref = self.vis.selectAll("g.node").data();
    for(_i = 0, _len = _ref.length; _i < _len; _i++) {
      obj = _ref[_i];
      if (obj.data.id == id) {
        return obj;
      }
    }
  },

  load_topology: function(data){
    var self = this;
    self.data = {};

    // Networks
    self.data.networks = {}
    var net, _i, _netlen, _netref;
    _netref = data.networks;
    for (_i = 0, _netlen = _netref.length; _i < _netlen; _i++) {
      net = _netref[_i];
      var network = null;
      if(net['router:external'] == true){
        network = new ExternalNetwork(net);
      } else {
        network = new Network(net);
      }

      self.data.networks[network.id] = network;
      self.new_node(network);
    }

    // Routers
    self.data.routers = {}
    var rou, _j, _roulen, _rouref;
    _rouref = data.routers;
    for (_j = 0, _roulen = _rouref.length; _j < _roulen; _j++) {
      rou = _rouref[_j];
      var router = new Router(rou);
      self.data.routers[router.id] = router;
      self.new_node(router);
    }

    // Servers
    self.data.servers = {}
    var ser, _k, _serlen, _serref;
    _serref = data.servers;
    for (_k = 0, _serlen = _serref.length; _k < _serlen; _k++) {
      ser = _serref[_k];
      var server = new Server(ser);
      self.data.servers[server.id] = server;
      self.new_node(server);
    }

    // Ports
    var port, _l, _portlen, _portref;
    _portref = data.ports;
    for (_l = 0, _portlen = _portref.length; _l < _portlen; _l++) {
      port = _portref[_l];
      var device = self.find_by_id(port.device_id)
      var network = self.find_by_id(port.network_id)
      if (device != undefined && network != undefined){
        if(port.device_owner == "compute:nova"){
          device.data.networks.push(network.data);
        }
        self.new_link(self.find_by_id(port.device_id), self.find_by_id(port.network_id))
      }
    }
  },

  removeNode: function(obj) {
    var filterNetwork, filterNode, n, node, _i, _len, _ref;
    _ref = this.nodes;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      n = _ref[_i];
      if (n.data === obj) {
        node = n;
        break;
      }
    }
    if (node) {
      this.nodes.splice(this.nodes.indexOf(node), 1);
      filterNode = function(obj) {
        return function(d, i) {
          return obj === d.data;
        };
      };
      filterNetwork = function(obj) {
        return function(d, i) {
          return obj === d.network.data;
        };
      };
      if (obj instanceof Network) {
        this.vis.selectAll(".hulls").filter(filterNetwork(obj)).remove();
      }
      this.vis.selectAll("g.node").filter(filterNode(obj)).remove();
      return this.removeNodesLinks(obj);
    }
  },

  removeNodesLinks: function(node) {
    var l, linksToRemove, _i, _j, _len, _len1, _ref;
    linksToRemove = [];
    _ref = this.links;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      l = _ref[_i];
      if (l.source.data === node) {
        linksToRemove.push(l);
      } else if (l.target.data === node) {
        linksToRemove.push(l);
      }
    }
    for (_j = 0, _len1 = linksToRemove.length; _j < _len1; _j++) {
      l = linksToRemove[_j];
      this.removeLink(l);
    }
    return this.force.resume();
  },

  removeLink: function(link) {
    var i, index, l, _i, _len, _ref;
    index = -1;
    _ref = this.links;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      l = _ref[i];
      if (l === link) {
        index = i;
        break;
      }
    }
    if (index !== -1) {
      this.links.splice(index, 1);
    }
    return this.vis.selectAll("line.link").data(this.links).exit().remove();
  },

  delete_device: function(type, device_id) {
    var self = this;
    var message = {id:device_id};
    self.post_message(device_id,type,message);
  },

  delete_port: function(router_id, port_id) {
    var self = this;
    var message = {id:port_id};
    self.post_message(port_id, 'router/' + router_id + '/', message);
  },

  show_balloon: function(d,element) {
    var self = this;
    var element_properties = self.element_properties[self.draw_mode];
    if (self.balloon_id) {
      self.delete_balloon();
    }
    var balloon_tmpl = self.balloon_tmpl;
    var device_tmpl = self.balloon_device_tmpl;
    var port_tmpl = self.balloon_port_tmpl;
    var balloon_id = 'bl_' + d.id;
    var ports = [];
    //$.each(d.ports,function(i, port){
      //var object = {};
      //object.id = port.id;
      //object.router_id = port.device_id;
      //object.url = port.url;
      //object.port_status = port.status;
      //object.port_status_css = (port.status === "ACTIVE")? 'active' : 'down';
      //var ip_address = '';
      //try {
        //ip_address = port.fixed_ips[0].ip_address;
      //}catch(e){
        //ip_address = gettext('None');
      //}
      //var device_owner = '';
      //try {
        //device_owner = port.device_owner.replace('network:','');
      //}catch(e){
        //device_owner = gettext('None');
      //}
      //object.ip_address = ip_address;
      //object.device_owner = device_owner;
      //object.is_interface = (device_owner === 'router_interface');
      //ports.push(object);
    //});
    var html_data = {
      balloon_id:balloon_id,
      id:d.id,
      url:d.url,
      name:d.name,
      //type:d.type,
      delete_label: gettext("Delete"),
      status:d.status,
      status_class:(d.status === "ACTIVE")? 'active' : 'down',
      status_label: gettext("STATUS"),
      id_label: gettext("ID"),
      interfaces_label: gettext("Interfaces"),
      delete_interface_label: gettext("Delete Interface"),
      open_console_label: gettext("Open Console"),
      view_details_label: gettext("View Details")
    };
    if (d instanceof Router) {
      html_data.delete_label = gettext("Delete Router");
      html_data.view_details_label = gettext("View Router Details");
      html_data.port = ports;
      html_data.add_interface_url = d.url + 'addinterface';
      html_data.add_interface_label = gettext("Add Interface");
      html = balloon_tmpl.render(html_data,{
        table1:device_tmpl,
        table2:(ports.length > 0) ? port_tmpl : null
      });
    } else if (d instanceof Server) {
      html_data.delete_label = gettext("Terminate Instance");
      html_data.view_details_label = gettext("View Instance Details");
      html_data.console_id = d.id;
      html_data.console = d.console;
      html = balloon_tmpl.render(html_data,{
        table1:device_tmpl
      });
    } else {
      return;
    }
    $(self.svg_container).append(html);
    var device_position = element.find('.frame');
    var x = device_position.position().left +
      element_properties.device_width +
      element_properties.balloon_margin.x;
    var y = device_position.position().top +
      element_properties.balloon_margin.y;
    $('#' + balloon_id).css({
      'left': x + 'px',
      'top': y + 'px'
    })
      .show();
    var $balloon = $('#' + balloon_id);
    if (device_position.position().left + $balloon.outerWidth() > $(window).outerWidth()) {
      $balloon
        .css({
          'left': 0 + 'px'
        })
        .css({
          'left': (device_position.position().left - $balloon.outerWidth() -
            element_properties.balloon_margin.x + 'px')
        })
        .addClass('leftPosition');
    }
    $balloon.find('.delete-device').click(function(e){
      var $this = $(this);
      $this.prop('disabled', true);
      d3.select('#id_' + $this.data('device-id')).classed('loading',true);
      self.delete_device($this.data('type'),$this.data('device-id'));
    });
    $balloon.find('.delete-port').click(function(e){
      var $this = $(this);
      self.delete_port($this.data('router-id'),$this.data('port-id'));
    });
    self.balloon_id = balloon_id;
  },

  delete_balloon:function() {
    var self = this;
    if(self.balloon_id) {
      $('#' + self.balloon_id).remove();
      self.balloon_id = null;
    }
  },

  svgs: function(name){
    switch(name){
      case 'router':
        return "m 26.628571,16.08 -8.548572,0 0,8.548571 2.08,-2.079998 6.308572,6.30857 4.38857,-4.388572 -6.308571,-6.30857 z m -21.2571429,-4.159999 8.5485709,0 0,-8.5485723 -2.08,2.08 L 5.5314281,-0.85714307 1.1428571,3.5314287 7.4514281,9.84 z m -3.108571,7.268571 0,8.548571 8.5485709,0 L 8.7314281,25.657144 15.039999,19.325715 10.674285,14.96 4.3428571,21.268573 z M 29.737142,8.8114288 l 0,-8.54857147 -8.548572,0 2.08,2.07999987 -6.308571,6.3085716 4.388572,4.3885722 6.308571,-6.3085723 z"
      default:
        return ""
    }
  }
}
