type Factory<T = unknown> = () => T;

export class Container {
  private factories = new Map<string, Factory>();
  private instances = new Map<string, unknown>();

  register<T>(name: string, factory: Factory<T>): void {
    this.factories.set(name, factory);
    this.instances.delete(name); // clear cached instance on re-register
  }

  resolve<T>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name) as T;
    }
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service "${name}" not registered`);
    }
    const instance = factory() as T;
    this.instances.set(name, instance);
    return instance;
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }
}
