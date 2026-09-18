class Menu:
    def __init__(self, name, parent=None, callback=None,
                 submenus=None, dynamic_items=None,
                 title=None, screen_flow=False):
        self.name          = name
        self.title         = title or name
        self.parent        = parent
        self.callback      = callback       # callable for leaf action; None → go back
        self.subMenus      = list(submenus) if submenus else []
        self.dynamic_items = dynamic_items  # callable → list[Menu]
        self.screen_flow   = screen_flow    # True: unregister buttons + rebuild view after cb
        self.last_position = 0              # saved index when entering a child; restored on back

        for child in self.subMenus:
            child.parent = self

    @property
    def isMenu(self):
        return bool(self.subMenus) or self.dynamic_items is not None

    def get_children(self):
        if self.dynamic_items is not None:
            children = self.dynamic_items()
            for c in children:
                c.parent = self
            return children
        return self.subMenus
