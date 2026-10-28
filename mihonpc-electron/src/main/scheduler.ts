import type { CollectionService } from './collection'
import type { SettingsStore } from './settings'
export class UpdateScheduler {
  private next = Date.now()
  private hours = -1
  constructor(
    private readonly collection: CollectionService,
    private readonly settings: SettingsStore,
    private readonly onBattery: () => boolean,
    private readonly notify: (count: number) => void
  ) {}
  async tick(now = Date.now()): Promise<void> {
    const prefs = this.settings.get()
    if (this.hours !== prefs.updateHours) {
      this.hours = prefs.updateHours
      this.next = now + this.hours * 3600000
    }
    if (
      !this.hours ||
      prefs.offlineOnly ||
      now < this.next ||
      this.collection.status().running ||
      (prefs.chargeOnly && this.onBattery())
    )
      return
    this.next = now + this.hours * 3600000
    const result = await this.collection.check()
    if (result.added && this.settings.get().notifications) this.notify(result.added)
  }
}
