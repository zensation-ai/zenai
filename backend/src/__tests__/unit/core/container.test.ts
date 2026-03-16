import { Container } from '../../../core/container';

describe('Container', () => {
  it('should register and resolve a service', () => {
    const container = new Container();
    container.register('config', () => ({ port: 3000 }));
    const config = container.resolve<{ port: number }>('config');
    expect(config.port).toBe(3000);
  });

  it('should return singleton by default', () => {
    const container = new Container();
    let count = 0;
    container.register('counter', () => ({ id: ++count }));
    const a = container.resolve('counter');
    const b = container.resolve('counter');
    expect(a).toBe(b);
  });

  it('should throw on unregistered service', () => {
    const container = new Container();
    expect(() => container.resolve('missing')).toThrow('Service "missing" not registered');
  });

  it('should support has() check', () => {
    const container = new Container();
    container.register('foo', () => 'bar');
    expect(container.has('foo')).toBe(true);
    expect(container.has('baz')).toBe(false);
  });
});
