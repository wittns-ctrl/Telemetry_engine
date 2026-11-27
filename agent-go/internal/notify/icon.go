package notify

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// Lectio's mark (frontend/public/favicon.svg): a grey L and a green bookmark
// in a 45 x 45 box, the L shifted right by 6.25.
var (
	markL = [][2]float64{{6.25, 0}, {19.25, 0}, {19.25, 32.5}, {38.75, 32.5}, {38.75, 45}, {6.25, 45}}
	markR = [][2]float64{{25.25, 0}, {38.75, 0}, {38.75, 25.4}, {32, 20.4}, {25.25, 25.4}}
	grey  = color.NRGBA{0x41, 0x41, 0x42, 0xff}
	green = color.NRGBA{0x2e, 0x8b, 0x37, 0xff}
)

func inside(poly [][2]float64, x, y float64) bool {
	in := false
	for i, j := 0, len(poly)-1; i < len(poly); j, i = i, i+1 {
		xi, yi, xj, yj := poly[i][0], poly[i][1], poly[j][0], poly[j][1]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}

// IconPNG draws the mark on a white rounded square, size x size pixels,
// smoothing edges by sampling each pixel 4 x 4 times.
func IconPNG(size int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	pad := float64(size) * 0.16
	scale := (float64(size) - 2*pad) / 45
	radius := float64(size) * 0.22
	const ss = 4
	for py := 0; py < size; py++ {
		for px := 0; px < size; px++ {
			var bg, l, r int
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					x := float64(px) + (float64(sx)+0.5)/ss
					y := float64(py) + (float64(sy)+0.5)/ss
					if !inRounded(x, y, float64(size), radius) {
						continue
					}
					mx, my := (x-pad)/scale, (y-pad)/scale
					switch {
					case inside(markL, mx, my):
						l++
					case inside(markR, mx, my):
						r++
					default:
						bg++
					}
				}
			}
			n := bg + l + r
			if n == 0 {
				continue
			}
			mix := func(c func(color.NRGBA) uint8) uint8 {
				return uint8((255*bg + int(c(grey))*l + int(c(green))*r) / n)
			}
			img.SetNRGBA(px, py, color.NRGBA{
				R: mix(func(c color.NRGBA) uint8 { return c.R }),
				G: mix(func(c color.NRGBA) uint8 { return c.G }),
				B: mix(func(c color.NRGBA) uint8 { return c.B }),
				A: uint8(255 * n / (ss * ss)),
			})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func inRounded(x, y, size, r float64) bool {
	cx := clamp(x, r, size-r)
	cy := clamp(y, r, size-r)
	dx, dy := x-cx, y-cy
	return dx*dx+dy*dy <= r*r
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
