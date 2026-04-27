"""Generic named-component registry for the strategy pattern."""


class Registry:
    def __init__(self, name: str):
        self.name = name
        self._registry: dict[str, object] = {}

    def register(self, key: str):
        """Decorator to register a component by key."""
        def decorator(fn):
            self._registry[key] = fn
            return fn
        return decorator

    def get(self, key: str):
        if key not in self._registry:
            raise KeyError(f"[{self.name}] No component registered for '{key}'. Available: {list(self._registry.keys())}")
        return self._registry[key]

    def list_keys(self) -> list[str]:
        return list(self._registry.keys())
