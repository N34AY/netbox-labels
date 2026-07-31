from django.test import SimpleTestCase

from netbox_labels.layout import (
    _jinja_str_literal,
    _num,
    _render_format_string,
    layout_to_css,
    layout_to_html,
    text_content,
)


class NumTests(SimpleTestCase):
    def test_parses_valid_numeric_string(self):
        self.assertEqual(_num('12.5', 0), 12.5)

    def test_falls_back_on_non_numeric_string(self):
        self.assertEqual(_num('not-a-number', 7), 7)

    def test_falls_back_on_none(self):
        self.assertEqual(_num(None, 3), 3)


class JinjaStrLiteralTests(SimpleTestCase):
    """These values are spliced directly into generated Jinja2 source (see
    text_content's "custom"/"format" default() fallback) — a literal that
    isn't escaped correctly would break template compilation or, worse,
    let the fallback string terminate early and leak into real syntax."""

    def test_escapes_single_quotes(self):
        self.assertEqual(_jinja_str_literal("it's"), "'it\\'s'")

    def test_escapes_backslashes(self):
        self.assertEqual(_jinja_str_literal('a\\b'), "'a\\\\b'")

    def test_plain_string_is_just_quoted(self):
        self.assertEqual(_jinja_str_literal('object.status'), "'object.status'")


class TextContentTests(SimpleTestCase):
    def test_static_binding_escapes_html_and_wraps_raw(self):
        # Regression test: a static label containing "{{ ... }}"-looking text,
        # or literal HTML, must never be interpreted as markup or Jinja2
        # syntax when the generated html_code is rendered.
        element = {'binding': 'static', 'text': '<script>alert(1)</script>'}
        result = text_content(element)
        self.assertEqual(result, '{% raw %}&lt;script&gt;alert(1)&lt;/script&gt;{% endraw %}')

    def test_object_binding(self):
        self.assertEqual(text_content({'binding': 'object'}), '{{ object }}')

    def test_object_type_binding(self):
        self.assertEqual(text_content({'binding': 'object_type'}), '{{ object_type.model }}')

    def test_custom_binding_wraps_expression_with_default_fallback(self):
        result = text_content({'binding': 'custom', 'expr': 'object.status'})
        self.assertEqual(result, "{{ (object.status)|default('object.status') }}")

    def test_custom_binding_empty_or_missing_expr_returns_empty_string(self):
        # Regression test: an empty expression used to produce either a bare
        # "{{ }}" (Jinja2 syntax error) or, with an earlier version of the
        # default() wrapping, "{{ () }}" (a silently-wrong empty tuple).
        self.assertEqual(text_content({'binding': 'custom', 'expr': ''}), '')
        self.assertEqual(text_content({'binding': 'custom', 'expr': '   '}), '')
        self.assertEqual(text_content({'binding': 'custom'}), '')

    def test_format_binding_mixes_literal_and_placeholder(self):
        element = {'binding': 'format', 'format': 'IP - ${object.primary_ip}'}
        result = text_content(element)
        self.assertEqual(
            result,
            "{% raw %}IP - {% endraw %}{{ (object.primary_ip)|default('object.primary_ip') }}",
        )

    def test_format_binding_escapes_literal_segments(self):
        element = {'binding': 'format', 'format': '<b>${object}</b>'}
        result = text_content(element)
        self.assertNotIn('<b>', result)
        self.assertIn('{% raw %}&lt;b&gt;{% endraw %}', result)
        self.assertIn('{% raw %}&lt;/b&gt;{% endraw %}', result)

    def test_unknown_binding_returns_empty_string(self):
        self.assertEqual(text_content({'binding': 'nonsense'}), '')


class RenderFormatStringTests(SimpleTestCase):
    def test_unclosed_placeholder_is_left_as_literal_text(self):
        # An unclosed "${" must never swallow the rest of the string as if it
        # were the start of a real expression.
        result = _render_format_string('abc ${unclosed')
        self.assertNotIn('{{', result)
        self.assertIn('abc ', result)

    def test_multiple_placeholders_each_get_their_own_default(self):
        result = _render_format_string('${a} and ${b}')
        self.assertIn("(a)|default('a')", result)
        self.assertIn("(b)|default('b')", result)

    def test_blank_placeholder_expression_is_skipped(self):
        result = _render_format_string('x${ }y')
        self.assertNotIn('{{', result)


class LayoutToHtmlTests(SimpleTestCase):
    def test_qr_element_renders_data_attributes_and_position(self):
        layout = {'elements': [
            {'id': 'q1', 'type': 'qr', 'x_mm': 1, 'y_mm': 2, 'width_mm': 10, 'height_mm': 10, 'correct_level': 'L'},
        ]}
        html = layout_to_html(layout, 40, 12)
        self.assertIn('data-netbox-qr', html)
        self.assertIn('data-correct-level="L"', html)
        self.assertIn('left:1.0mm', html)
        self.assertIn('top:2.0mm', html)

    def test_qr_element_invalid_correct_level_falls_back_to_h(self):
        layout = {'elements': [{'id': 'q1', 'type': 'qr', 'correct_level': 'nonsense'}]}
        html = layout_to_html(layout)
        self.assertIn('data-correct-level="H"', html)

    def test_image_element_escapes_src_against_attribute_breakout(self):
        layout = {'elements': [{'id': 'i1', 'type': 'image', 'src': '"><script>alert(1)</script>'}]}
        html = layout_to_html(layout)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)

    def test_unknown_element_type_is_skipped_not_erroring(self):
        layout = {'elements': [{'id': 'x', 'type': 'mystery'}]}
        html = layout_to_html(layout)
        # Only the root wrapper div should be present.
        self.assertEqual(html.count('<div'), 1)

    def test_missing_elements_key_defaults_to_empty(self):
        html = layout_to_html({})
        self.assertEqual(html.count('<div'), 1)

    def test_root_wrapper_uses_provided_canvas_dimensions(self):
        html = layout_to_html({'elements': []}, 40, 12)
        self.assertIn('width:40.0mm', html)
        self.assertIn('height:12.0mm', html)

    def test_barcode_element_renders_attributes_and_position(self):
        layout = {'elements': [
            {'id': 'b1', 'type': 'barcode', 'x_mm': 1, 'y_mm': 2, 'width_mm': 20, 'height_mm': 10,
             'barcode_format': 'EAN13', 'color': '#ff0000'},
        ]}
        html = layout_to_html(layout, 40, 12)
        self.assertIn('class="netbox-labels-barcode"', html)
        self.assertIn('data-barcode-format="EAN13"', html)
        self.assertIn('data-barcode-color="#ff0000"', html)
        self.assertIn('left:1.0mm', html)
        self.assertIn('top:2.0mm', html)

    def test_barcode_element_invalid_format_falls_back_to_code128(self):
        layout = {'elements': [{'id': 'b1', 'type': 'barcode', 'barcode_format': 'nonsense'}]}
        html = layout_to_html(layout)
        self.assertIn('data-barcode-format="CODE128"', html)

    def test_barcode_element_defaults_to_black_and_code128(self):
        layout = {'elements': [{'id': 'b1', 'type': 'barcode'}]}
        html = layout_to_html(layout)
        self.assertIn('data-barcode-format="CODE128"', html)
        self.assertIn('data-barcode-color="#000000"', html)

    def test_barcode_element_encodes_the_bound_value_as_inner_text_not_an_attribute(self):
        layout = {'elements': [{'id': 'b1', 'type': 'barcode', 'binding': 'object'}]}
        html = layout_to_html(layout)
        opening_tag_end = html.index('>', html.index('<canvas'))
        self.assertIn('{{ object }}', html[opening_tag_end:])

    def test_barcode_static_binding_escapes_text_against_content_breakout(self):
        layout = {'elements': [
            {'id': 'b1', 'type': 'barcode', 'binding': 'static', 'text': '<script>alert(1)</script>'},
        ]}
        html = layout_to_html(layout)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)

    def test_barcode_custom_binding_with_a_quote_in_the_expression_does_not_break_the_attributes(self):
        # Regression test: the encoded value must be embedded as the <canvas>
        # element's inner text (like text_content() already is for
        # _render_text_element's <div>), not inside a data-*="..." attribute
        # — a "custom"/"format" binding's admin-authored expression is not
        # attribute-escaped, so a literal `"` in it (e.g. a dict-style
        # lookup) would otherwise break out of a quoted attribute.
        layout = {'elements': [
            {'id': 'b1', 'type': 'barcode', 'binding': 'custom', 'expr': 'object.get("x")'},
        ]}
        html = layout_to_html(layout)
        self.assertIn('data-barcode-format="CODE128"', html)
        self.assertIn('data-barcode-color="#000000"', html)
        opening_tag_end = html.index('>', html.index('<canvas'))
        self.assertIn('object.get("x")', html[opening_tag_end:])

    def test_barcode_element_escapes_color_against_attribute_breakout(self):
        layout = {'elements': [{'id': 'b1', 'type': 'barcode', 'color': '"><script>alert(1)</script>'}]}
        html = layout_to_html(layout)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)


class LayoutToCssTests(SimpleTestCase):
    def test_uses_period_decimal_not_locale_comma(self):
        # Regression test: this is raw CSS text, not Django-templated output —
        # a locale that formats numbers with a comma (e.g. uk) would produce
        # invalid CSS ("40,5mm") if this ever went through Django's own
        # number formatting instead of plain Python float interpolation.
        css = layout_to_css({}, 40.5, 12.0)
        self.assertIn('40.5mm', css)
        self.assertNotIn('40,5', css)

    def test_page_and_body_size_match_given_dimensions(self):
        css = layout_to_css({}, 30, 15)
        self.assertIn('@page { size: 30.0mm 15.0mm; margin: 0; }', css)
        self.assertIn('html, body { width: 30.0mm; height: 15.0mm; }', css)
