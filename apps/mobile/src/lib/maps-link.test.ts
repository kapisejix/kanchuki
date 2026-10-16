import { describe, expect, it } from 'vitest'
import { parseMapsLink } from './maps-link'

describe('parseMapsLink', () => {
  it('prefers the place pin (!3d!4d) over the map centre (@)', () => {
    const url =
      'https://www.google.com/maps/place/Shop/@26.9100,75.7800,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d26.9124!4d75.7873'
    expect(parseMapsLink(url)).toEqual({ lat: 26.9124, lng: 75.7873 })
  })

  it('reads @lat,lng, q=, ll= and destination=', () => {
    expect(parseMapsLink('https://www.google.com/maps/@28.6139,77.209,15z')).toEqual({ lat: 28.6139, lng: 77.209 })
    expect(parseMapsLink('https://maps.google.com/?q=19.076,72.8777')).toEqual({ lat: 19.076, lng: 72.8777 })
    expect(parseMapsLink('https://maps.google.com/?ll=12.97,77.59')).toEqual({ lat: 12.97, lng: 77.59 })
    expect(parseMapsLink('https://www.google.com/maps/dir/?api=1&destination=22.5726%2C88.3639')).toEqual({
      lat: 22.5726,
      lng: 88.3639,
    })
  })

  it('rejects links without coordinates and out-of-range values', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/abc123')).toBeNull()
    expect(parseMapsLink('not a link')).toBeNull()
    expect(parseMapsLink('https://maps.google.com/?q=95.0,10.0')).toBeNull()
  })
})
