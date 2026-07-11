import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import React from 'react'
import { View, Text } from 'react-native'
import ProductCard from './ProductCard'

const sampleFooter = (
  <View>
    <Text testID="footer-text">Category · Color</Text>
    <Text testID="footer-price">₹1,999</Text>
  </View>
)

describe('ProductCard', () => {
  it('renders with an image URL', () => {
    const tree = render(
      <ProductCard
        imageUrl="https://cdn.example.com/product.jpg"
        onPress={() => {}}
        footer={sampleFooter}
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('with-image-url')
  })

  it('renders placeholder when imageUrl is null', () => {
    const tree = render(
      <ProductCard
        imageUrl={null}
        onPress={() => {}}
        footer={sampleFooter}
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('no-image-placeholder')
  })

  it('renders with a status badge', () => {
    const tree = render(
      <ProductCard
        imageUrl="https://cdn.example.com/sold.jpg"
        onPress={() => {}}
        footer={sampleFooter}
        statusBadge="SOLD"
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('with-status-badge')
  })

  it('renders with AI tagging indicator dot', () => {
    const tree = render(
      <ProductCard
        imageUrl="https://cdn.example.com/untagged.jpg"
        onPress={() => {}}
        footer={sampleFooter}
        showAIDot
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('with-ai-dot')
  })

  it('renders selected state with checkmark overlay', () => {
    const tree = render(
      <ProductCard
        imageUrl="https://cdn.example.com/selected.jpg"
        onPress={() => {}}
        footer={sampleFooter}
        selected
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('selected-checkmark')
  })

  it('renders with custom height and placeholder icon', () => {
    const tree = render(
      <ProductCard
        imageUrl={null}
        onPress={() => {}}
        footer={sampleFooter}
        imageHeight={144}
        placeholderIcon="👕"
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('custom-height-placeholder')
  })

  it('renders with all props combined', () => {
    const tree = render(
      <ProductCard
        imageUrl="https://cdn.example.com/full.jpg"
        onPress={() => {}}
        footer={sampleFooter}
        elevation={3}
        statusBadge="RESERVED"
        showAIDot
        selected
        cachePolicy="memory"
      />,
    )
    expect(tree.toJSON()).toMatchSnapshot('all-props-combined')
  })
})
