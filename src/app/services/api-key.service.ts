import { Injectable } from '@angular/core';
import { HttpController } from './http-controller.service';
import { Controller } from '@models/controller';
import { Observable } from 'rxjs';
import { ApiKey, ApiKeyCreatedResponse } from '@models/api/api-key';

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  constructor(private httpController: HttpController) {}

  list(controller: Controller): Observable<ApiKey[]> {
    return this.httpController.get<ApiKey[]>(controller, '/access/api-keys');
  }

  create(controller: Controller, name: string): Observable<ApiKeyCreatedResponse> {
    return this.httpController.post<ApiKeyCreatedResponse>(controller, '/access/api-keys', { name });
  }

  revoke(controller: Controller, apiKeyId: string): Observable<void> {
    return this.httpController.delete<void>(controller, `/access/api-keys/${apiKeyId}`);
  }
}
