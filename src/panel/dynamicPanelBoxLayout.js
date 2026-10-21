import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

export const DynamicPanelBoxLayout = GObject.registerClass(
class DynamicPanelBoxLayout extends Clutter.BoxLayout {
    _init(panel, geometry) {
        super._init();
        this._panel = panel;
        this._panelGeometry = geometry;
    }

    setPanelGeometry(geometry) {
        this._panelGeometry = geometry;
        this.layout_changed();
    }

    vfunc_allocate(container, _box) {
        const {x, y, width, height} = this._panelGeometry;
        const allocation = new Clutter.ActorBox({
            x1: x,
            y1: y,
            x2: x + width,
            y2: y + height,
        });
        for (const child of container.get_children()) {
            if (child === this._panel) {
                child.allocate(allocation);
            } else {
                child.allocate_preferred_size(child.fixed_x, child.fixed_y);
            }
        }
    }
});
