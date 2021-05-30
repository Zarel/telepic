/**
 * Drawing canvas
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license MIT
 */

export interface Stroke {
  color: string;
  width: number;
  points: [number, number][],
}

function h<T extends HTMLElement = HTMLElement>(
  tagName: string | T, attrs?: Omit<Partial<T>, 'style'> & {style?: Partial<T['style']>}, children?: (HTMLElement | string)[]
): T {
  const elem = typeof tagName === 'string' ? document.createElement(tagName) as T : tagName;
  const style = attrs?.style;
  if (attrs) {
    delete attrs.style;
    Object.assign(elem, attrs);
  }
  if (style) Object.assign(elem.style, style);
  if (children) for (const child of children) {
    elem.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return elem;
}

export class CanvasDraw {
  wrapper: HTMLDivElement;

  /** mostly just holds the cursor */
  interfaceCanvas: HTMLCanvasElement;
  currentStrokeCanvas: HTMLCanvasElement;
  drawingCanvas: HTMLCanvasElement;

  interfaceContext: CanvasRenderingContext2D;
  currentStrokeContext: CanvasRenderingContext2D;
  drawingContext: CanvasRenderingContext2D;

  strokes: Stroke[] = [];
  clearedStrokes: Stroke[][] = [];
  currentStroke: Stroke | null = null;

  pixelRatio = window.devicePixelRatio || 1;
  w = 320 * this.pixelRatio;
  h = 320 * this.pixelRatio;

  strokeWidth = 2;
  strokeColor = 'black';

  constructor(wrapper?: HTMLDivElement | null) {
    if (wrapper && wrapper.dataset.dimensions) {
      const [width, height] = wrapper.dataset.dimensions.split('x');
      this.w = Math.round(parseInt(width) * this.pixelRatio);
      this.h = Math.round(parseInt(height) * this.pixelRatio);
    }
    if (!wrapper) wrapper = document.createElement('div');
    wrapper.innerHTML = '';

    const styleWidth = `${Math.round(this.w / this.pixelRatio)}px`;
    const styleHeight = `${Math.round(this.h / this.pixelRatio)}px`;

    this.wrapper = h(wrapper, undefined, [
      h('div', {className: 'top-controls', style: {marginBottom: '4px'}}, [
        h<HTMLButtonElement>('button', {name: 'undo', onclick: this.undo}, ["Undo"]), " ",
        h<HTMLButtonElement>('button', {name: 'clear', onclick: this.clear}, ["Clear"]),
      ]),
      h('div', {className: 'left-controls', style: {marginBottom: '4px'}}, [
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "black"}, [
          h('span', {className: 'color', style: {background: 'black', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#F55252"}, [ // red
          h('span', {className: 'color', style: {background: '#F55252', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#F8BC01"}, [ // yellow
          h('span', {className: 'color', style: {background: '#F8BC01', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#3DC853"}, [ // green
          h('span', {className: 'color', style: {background: '#3DC853', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#42B0FF"}, [ // blue
          h('span', {className: 'color', style: {background: '#42B0FF', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#D512F9"}, [ // purple
          h('span', {className: 'color', style: {background: '#D512F9', display: 'inline-block', width: '12px', height: '12px'}}),
        ]), " ",
        h<HTMLButtonElement>('button', {className: 'color', onclick: this.clickColor, value: "#8D6E63"}, [ // brown
          h('span', {className: 'color', style: {background: '#8D6E63', display: 'inline-block', width: '12px', height: '12px'}}),
        ]),
        " | ",
        h<HTMLButtonElement>('button', {onclick: this.clickStrokeWidth, value: "1"}, [
          "Thin",
        ]), " ",
        h<HTMLButtonElement>('button', {onclick: this.clickStrokeWidth, value: "2"}, [
          "Normal",
        ]), " ",
        h<HTMLButtonElement>('button', {onclick: this.clickStrokeWidth, value: "4"}, [
          "Thick",
        ]), " ",
      ]),
      h('div', {className: 'canvas-draw', style: {width: styleWidth, height: styleHeight, border: `1px solid gray`, boxSizing: `content-box`}}, [
        (this.drawingCanvas = h<HTMLCanvasElement>('canvas', {
          width: this.w,
          height: this.h,
          style: {width: styleWidth, height: styleHeight, display: 'block', position: 'absolute'},
        })),

        (this.currentStrokeCanvas = h<HTMLCanvasElement>('canvas', {
          width: this.w,
          height: this.h,
          style: {width: styleWidth, height: styleHeight, display: 'block', position: 'absolute'},
        })),

        (this.interfaceCanvas = h<HTMLCanvasElement>('canvas', {
          width: this.w,
          height: this.h,
          style: {width: styleWidth, height: styleHeight, display: 'block', position: 'absolute', cursor: 'crosshair'},
          onmousedown: this.mousedown,
          onmousemove: this.mousemove,
          onmouseup: this.mouseup,
          onmouseout: this.mouseup,
          ontouchstart: this.mousedown,
          ontouchmove: this.mousemove,
          ontouchend: this.mouseup,
          ontouchcancel: this.mouseup,
        })),
      ]),
    ]);

    this.interfaceContext = this.interfaceCanvas.getContext('2d')!;
    this.currentStrokeContext = this.currentStrokeCanvas.getContext('2d')!;
    this.drawingContext = this.drawingCanvas.getContext('2d')!;

    this.updateButtons();
    this.redraw();
  }

  getPosition(ev: MouseEvent | TouchEvent): [number, number] {
    const rect = this.interfaceCanvas.getBoundingClientRect();

    let x = (ev as MouseEvent).clientX;
    let y = (ev as MouseEvent).clientY;

    // use first touch if available
    const touches = (ev as TouchEvent).changedTouches;
    if (touches && touches.length > 0) {
      x = touches[0].clientX;
      y = touches[0].clientY;
    }

    const pixelRatio = this.w / rect.width;
    // It's impossible to get the actual coordinates on a Retina screen, so we have to approximate
    return [(x - rect.left) * pixelRatio, (y - rect.top) * pixelRatio];
  }

  draw(x: number, y: number) {
    // draw cursor
    this.interfaceContext.clearRect(0, 0, this.w, this.h);
    this.interfaceContext.lineWidth = this.pixelRatio;
    this.interfaceContext.strokeStyle = 'gray';
    this.interfaceContext.beginPath();
    this.interfaceContext.arc(x, y, this.strokeWidth * this.pixelRatio, 0, Math.PI * 2);
    this.interfaceContext.stroke();

    // current stroke
    this.currentStrokeContext.clearRect(0, 0, this.w, this.h);

    if (!this.currentStroke) return;
    this.drawStroke(this.currentStrokeContext, this.currentStroke);
  }
  redraw() {
    this.drawingContext.fillStyle = 'white';
    this.drawingContext.fillRect(0, 0, this.w, this.h);
    for (const stroke of this.strokes) {
      this.drawStroke(this.drawingContext, stroke);
    }
  }
  drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width * 2 * this.pixelRatio;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    let [x, y] = stroke.points[0];
    context.beginPath();
    context.moveTo(x, y);
    for (let i = 1; i < stroke.points.length; i++) {
      [x, y] = stroke.points[i];
      context.lineTo(x, y);
    }
    context.stroke();
  }
  commitStroke() {
    if (!this.currentStroke) return;
    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
    this.drawingContext.drawImage(this.currentStrokeCanvas, 0, 0, this.w, this.h);
    this.currentStrokeContext.clearRect(0, 0, this.w, this.h);
    this.updateButtons();
  }

  updateButtons() {
    const buttons = this.wrapper.getElementsByTagName('button');
    for (const button of buttons as any as HTMLButtonElement[]) {
      if (button.name === 'undo') {
        button.disabled = !this.strokes.length && !this.clearedStrokes.length;
      } else if (button.name === 'clear') {
        button.disabled = !this.strokes.length;
      } else {
        button.disabled = (button.value === this.strokeColor || button.value === `${this.strokeWidth}`);
      }
    }
  }
  clickColor = (ev: Event) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const value = (ev.currentTarget as HTMLButtonElement).value;
    this.strokeColor = value;
    this.updateButtons();
  };
  clickStrokeWidth = (ev: Event) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const value = (ev.currentTarget as HTMLButtonElement).value;
    this.strokeWidth = parseInt(value);
    this.updateButtons();
  };
  undo = (ev: Event) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!this.strokes.length) {
      if (!this.clearedStrokes.length) return;
      this.strokes = this.clearedStrokes.pop()!;
    } else {
      this.strokes.pop();
    }
    this.redraw();
    this.updateButtons();
  }
  clear = (ev: Event) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!this.strokes.length) return;
    this.clearedStrokes.push(this.strokes);
    this.strokes = [];
    this.redraw();
    this.updateButtons();
  }
  mousedown = (ev: MouseEvent | TouchEvent) => {
    ev.preventDefault();
    const [x, y] = this.getPosition(ev);
    this.currentStroke = {
      points: [[x, y]],
      color: this.strokeColor,
      width: this.strokeWidth,
    };
    this.draw(x, y);
  };
  mousemove = (ev: MouseEvent | TouchEvent) => {
    const [x, y] = this.getPosition(ev);
    if (this.currentStroke) {
      this.currentStroke.points.push([x, y]);
    }
    this.draw(x, y);
  };
  mouseup = (ev: MouseEvent | TouchEvent) => {
    if (this.currentStroke) {
      const [x, y] = this.getPosition(ev);
      this.currentStroke.points.push([x, y]);
      this.commitStroke();
      this.draw(x, y);
    }
  };
}
