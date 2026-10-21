import {syncBlurGeometry} from '../integration/blurMyShellRuntime.js';

export class PanelMagnifyController {
    constructor({actor, panelBox, getMonitor, getVertical, getReserve, isEnabled,
        isDynamic, getBaseLength, updateWidth, onGeometryChanged = () => {}}) {
        this._actor = actor;
        this._panelBox = panelBox;
        this._getMonitor = getMonitor;
        this._getVertical = getVertical;
        this._getReserve = getReserve;
        this._isEnabled = isEnabled;
        this._isDynamic = isDynamic;
        this._getBaseLength = getBaseLength;
        this._updateWidth = updateWidth;
        this._onGeometryChanged = onGeometryChanged;
        this._extents = [0, 0];
        this.reserve = 0;
        this.centerOffset = 0;
        this.contentStart = 0;
        this.contentLength = 0;
    }

    onReserveChanged() {
        const reserve = this._getReserve();
        const [before, after] = this._extents;
        if (reserve > 0 || (before === 0 && after === 0))
            this.reserve = reserve;
        this._updateWidth();
    }

    onExtentsChanged(before, after) {
        this._extents = [before, after];
        if (!this._isEnabled())
            return;

        const reserve = this._getReserve();
        if (before === 0 && after === 0 && this.reserve !== reserve) {
            this.reserve = reserve;
            this._updateWidth();
            return;
        }
        this.sync();
    }

    sync() {
        if (!this._isEnabled())
            return;

        const vertical = this._getVertical();
        const lengthProperty = vertical ? 'height' : 'width';
        const positionProperty = vertical ? 'y' : 'x';
        const boxLength = this._panelBox[lengthProperty];
        let start = 0;
        let end = boxLength;
        let baseStart = 0;
        let baseLength = boxLength;
        if (this._isDynamic()) {
            const [before, after] = this._extents;
            baseLength = Math.min(this._getBaseLength() ?? boxLength, boxLength);
            baseStart = Math.floor((boxLength - baseLength) / 2);
            start = Math.clamp(baseStart + before, 0, boxLength);
            end = Math.clamp(baseStart + baseLength + after, start, boxLength);
        }
        const scale = this._getMonitor().geometry_scale;
        const boxStart = this._panelBox[positionProperty];
        start = Math.ceil((boxStart + start) * scale) / scale - boxStart;
        end = Math.max(start, Math.floor((boxStart + end) * scale) / scale - boxStart);
        const geometry = {
            x: vertical ? 0 : start,
            y: vertical ? start : 0,
            width: vertical ? this._panelBox.width : end - start,
            height: vertical ? end - start : this._panelBox.height,
        };
        this.centerOffset = boxLength - start - end;
        this.contentStart = baseStart - start;
        this.contentLength = baseLength;
        this._onGeometryChanged(geometry, this.centerOffset);
        this._actor.queue_relayout();
        syncBlurGeometry(this._actor);
    }

    destroy() {
        this._actor = null;
        this._panelBox = null;
        this._getMonitor = null;
        this._getVertical = null;
        this._getReserve = null;
        this._isEnabled = null;
        this._isDynamic = null;
        this._getBaseLength = null;
        this._updateWidth = null;
        this._onGeometryChanged = null;
    }
}
