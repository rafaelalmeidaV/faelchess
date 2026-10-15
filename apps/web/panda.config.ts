import { green } from "./src/theme/colors/green";
import { red } from "./src/theme/colors/red";
import { neutral } from "./src/theme/colors/neutral";
import { jade } from "./src/theme/colors/jade";
import { animationStyles } from "./src/theme/animation-styles";
import { zIndex } from "./src/theme/tokens/z-index";
import { shadows } from "./src/theme/tokens/shadows";
import { durations } from "./src/theme/tokens/durations";
import { colors } from "./src/theme/tokens/colors";
import { textStyles } from "./src/theme/text-styles";
import { layerStyles } from "./src/theme/layer-styles";
import { keyframes } from "./src/theme/keyframes";
import { globalCss } from "./src/theme/global-css";
import { conditions } from "./src/theme/conditions";
import { slotRecipes, recipes } from "./src/theme/recipes";
import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: true,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],

  theme: {
    extend: {
      animationStyles: animationStyles,
      recipes: recipes,
      slotRecipes: slotRecipes,
      keyframes: keyframes,
      layerStyles: layerStyles,
      textStyles: textStyles,

      tokens: {
        colors: colors,
        durations: durations,
        zIndex: zIndex
      },

      semanticTokens: {
        colors: {
          fg: {
            default: {
              value: {
                _light: "{colors.gray.12}",
                _dark: "{colors.gray.12}"
              }
            },

            muted: {
              value: {
                _light: "{colors.gray.11}",
                _dark: "{colors.gray.11}"
              }
            },

            subtle: {
              value: {
                _light: "{colors.gray.10}",
                _dark: "{colors.gray.10}"
              }
            }
          },

          // Fundo da página (o globalCss do Park UI usa, mas o registro não define).
          canvas: {
            value: {
              _light: "{colors.white}",
              _dark: "{colors.gray.1}"
            }
          },

          border: {
            value: {
              _light: "{colors.gray.4}",
              _dark: "{colors.gray.4}"
            }
          },

          error: {
            value: {
              _light: "{colors.red.9}",
              _dark: "{colors.red.9}"
            }
          },

          jade: jade,
          gray: neutral,
          red: red,
          green: green
        },

        shadows: shadows,

        // Escala de raio "sm" do Park UI (cantos pouco arredondados): l1 dentro, l2 envolve l1, l3 envolve l2.
        radii: {
          l1: { value: "{radii.xs}" },
          l2: { value: "{radii.sm}" },
          l3: { value: "{radii.md}" }
        }
      }
    },
  },

  // Valores passados por variável (o Panda só gera o que enxerga literal no código).
  staticCss: {
    css: [{ properties: { colorPalette: ['jade', 'red', 'gray'] } }],
    recipes: { switchRecipe: [{ size: ['sm', 'md'] }] }
  },

  outdir: "styled-system",
  jsxFramework: "react",
  globalCss: globalCss,
  conditions: conditions
})