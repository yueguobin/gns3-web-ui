import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UploadServiceService {
  private countSource = new Subject();
  currentCount = this.countSource.asObservable();
  private cancelItem = new Subject();
  currentCancelItemDetails = this.cancelItem.asObservable();
  private messageSource = new BehaviorSubject<string>('');
  currentMessage = this.messageSource.asObservable();
  private computingSource = new BehaviorSubject<boolean>(false);
  currentComputing = this.computingSource.asObservable();

  constructor() {}

  processBarCount(processCount: number) {
    this.countSource.next(processCount);
  }
  cancelFileUploading(isCancel) {
    this.cancelItem.next(isCancel);
  }
  setMessage(message: string) {
    this.messageSource.next(message);
  }
  setComputing(value: boolean) {
    this.computingSource.next(value);
  }
}
