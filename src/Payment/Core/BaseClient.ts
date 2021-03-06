'use strict';

import BaseApplication from '../../Core/BaseApplication';
import HttpMixin from '../../Core/Mixins/HttpMixin';
import { applyMixins, randomString, makeSignature, singleItem } from '../../Core/Utils';
import * as Merge from 'merge';
import * as Xml2js from 'xml2js';
import * as Fs from 'fs';
import * as RawBody from 'raw-body';
import Response from '../../Core/Http/Response';

class BaseClient implements HttpMixin
{
  protected app: BaseApplication = null;

  protected serverIp: String = '';

  constructor(app: BaseApplication)
  {
    this.app = app;
  }

  protected prepends()
  {
    return {};
  }

  protected request(endpoint: string, params: object = {}, method: string = 'post', options: object = {}, returnResponse: boolean = false): Promise<any>
  {
    let base = {
      mch_id: this.app['config']['mch_id'],
      nonce_str: randomString(32),
      sub_mch_id: this.app['config']['sub_mch_id'] || '',
      sub_appid: this.app['config']['sub_appid'] || '',
    };

    let localParams = Merge(base, this.prepends(), params);
    localParams['sign_type'] = localParams['sign_type'] || 'md5';

    let secretKey = this.app['getKey'](endpoint);
    localParams['sign'] = makeSignature(localParams, secretKey, localParams['sign_type']);

    let XmlBuilder = new Xml2js.Builder({
      cdata: true,
      renderOpts: {
        pretty: false,
        indent: '',
        newline: '',
      }
    });
    let payload = Merge(options, {
      url: endpoint,
      method,
      body: XmlBuilder.buildObject(localParams)
    });

    return this.doRequest(payload, returnResponse)
      .then(async body => {
        if (!returnResponse) {
          try {
            body = await this.parseXml(body);
          }
          catch (e) { }
        }
        return body;
      });
  }

  async parseXml(xml: string): Promise<any>
  {
    let res = await Xml2js.parseStringPromise(xml);
    res = singleItem(res);
    if (res['xml']) res = res['xml'];
    return res;
  }

  protected safeRequest(endpoint: string, params: object = {}, method: string = 'post', options: object = {}): Promise<any>
  {
    options = Merge(options, {
      agentOptions: {
        pfx: Fs.readFileSync(this.app['config']['cert_path']),
        passphrase: this.app['config']['mch_id'],
      }
    });
    return this.request(endpoint, params, method, options);
  }

  protected async requestRaw(endpoint: string, params: object = {}, method: string = 'post', options: object = {}): Promise<any>
  {
    options['encoding'] = null;
    let res = await this.request(endpoint, params, method, options, true);
    let body = await RawBody(res);
    return new Response(body, res.statusCode, res.headers);
  }

  protected wrap(endpoint: string): string
  {
    return this.app['inSandbox']() ? `sandboxnew/${endpoint}` : endpoint;
  }

  async getServerIp()
  {
    if (!this.serverIp) {
      let res = await this.doRequest({
        baseUrl: '',
        url: 'https://api.ipify.org?format=json',
        method: 'GET',
      });
      if (res && res['ip']) {
        this.serverIp = res['ip'];
      }
    }

    return this.serverIp;
  }

  getClientIp()
  {
    return this.app['request'].getClientIp();
  }


  // Rewrite by HttpMixin
  async doRequest(payload: object, returnResponse: Boolean = false): Promise<any> { }

};

applyMixins(BaseClient, [HttpMixin]);

export default BaseClient;
