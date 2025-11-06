import BaseMapWrapper from '../utils/BaseMapWrapper';
import PetalMapService from './map';

export default class PetalMapWrapper extends BaseMapWrapper<any> {
  protected getServiceConstructor() {
    return PetalMapService;
  }
}
