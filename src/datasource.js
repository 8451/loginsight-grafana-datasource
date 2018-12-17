import _ from "lodash";

export class GenericDatasource {

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.withCredentials = instanceSettings.withCredentials;
    this.headers = {'Content-Type': 'application/json'};

    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.basicAuth = instanceSettings.basicAuth;
      var creds = atob(this.basicAuth.substr(6)).split(":");
      this.username = creds[0];
      this.password = btoa(creds[1]);
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  query(options) {
    var query = this.buildQueryParameters(options);
    query.targets = query.targets.filter(t => !t.hide);

    if (query.targets.length <= 0) {
      return this.q.when({data: []});
    }

    if (this.templateSrv.getAdhocFilters) {
      query.adhocFilters = this.templateSrv.getAdhocFilters(this.name);
    } else {
      query.adhocFilters = [];
    }

    return this.doRequest({
      url: this.url + '/query',
      data: query,
      method: 'POST'
    });
  }

  testDatasource() {
    var options = {
      url: '/api/v1/sessions',
      transformResponse: function(data) {
        return data;
      },
      method: 'POST',
    };

    return this._request(options).then(function(response) {
      return response.data;
    });
    // return this.doRequest({
    //   url: this.url + '/',
    //   method: 'GET',
    // }).then(response => {
    //   if (response.status === 200) {
    //     return { status: "success", message: "Data source is working", title: "Success" };
    //   }
    // });
  }

  // Helper to make API requests to Cloudera Manager. To avoid CORS issues, the requests may be proxied
  // through Grafana's backend via `backendSrv.datasourceRequest`.
  _request(options) {
    options.url = this.url + options.url;
    options.method = options.method || 'GET';
    options.inspect = { 'type': 'log_insight_manager' };

    if (this.basicAuth) {
      if(this.bearerAuth) {
        options.withCredentials = true;

        options.headers = {
          "Authorization": this.bearerAuth
        };
      } else {
        options.withCredentials = false;
        options.data = {
          'username': this.username,
          'password': atob(this.password)
        }        
      }  
      
    }

    return this.backendSrv.datasourceRequest(options);
  };

  annotationQuery(options) {
    var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
    var annotationQuery = {
      range: options.range,
      annotation: {
        name: options.annotation.name,
        datasource: options.annotation.datasource,
        enable: options.annotation.enable,
        iconColor: options.annotation.iconColor,
        query: query
      },
      rangeRaw: options.rangeRaw
    };

    return this.doRequest({
      url: this.url + '/annotations',
      method: 'POST',
      data: annotationQuery
    }).then(result => {
      return result.data;
    });
  }

  metricFindQuery(query) {
    var interpolated = {
        target: this.templateSrv.replace(query, null, 'regex')
    };

    return this.doRequest({
      url: this.url + '/search',
      data: interpolated,
      method: 'POST',
    }).then(this.mapToTextValue);
  }

  mapToTextValue(result) {
    return _.map(result.data, (d, i) => {
      if (d && d.text && d.value) {
        return { text: d.text, value: d.value };
      } else if (_.isObject(d)) {
        return { text: d, value: i};
      }
      return { text: d, value: d };
    });
  }

  doRequest(options) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    return this.backendSrv.datasourceRequest(options);
  }

  buildQueryParameters(options) {
    //remove placeholder targets
    options.targets = _.filter(options.targets, target => {
      return target.target !== 'select metric';
    });

    var targets = _.map(options.targets, target => {
      return {
        target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
        refId: target.refId,
        hide: target.hide,
        type: target.type || 'timeserie'
      };
    });

    options.targets = targets;

    return options;
  }

  getTagKeys(options) {
    return new Promise((resolve, reject) => {
      this.doRequest({
        url: this.url + '/tag-keys',
        method: 'POST',
        data: options
      }).then(result => {
        return resolve(result.data);
      });
    });
  }

  getTagValues(options) {
    return new Promise((resolve, reject) => {
      this.doRequest({
        url: this.url + '/tag-values',
        method: 'POST',
        data: options
      }).then(result => {
        return resolve(result.data);
      });
    });
  }

}
