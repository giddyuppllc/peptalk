/**
 * VialSVG — a data-true reconstitution vial.
 *
 * Shows the vial you actually hold: its stated strength, the diluent filled to
 * scale against the vial's capacity, and the concentration that results. The
 * "Reconstitute" card previously drew a SYRINGE here, clamped to
 * `Math.min(1, diluentMl)` — so a 3 mL diluent rendered as a full 1 mL barrel,
 * understating the volume threefold and picturing the wrong object entirely
 * (the diluent goes INTO a vial; the syringe is the next step).
 *
 * Fill height is `diluentMl / capacityMl`, so an over-fill is visible as liquid
 * at the shoulder rather than a number the reader has to catch. The diluent is
 * NAMED, because a few compounds (IGF-1 LR3, Dihexa) reconstitute in acetic
 * acid and using bacteriostatic water on those is a real mistake.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, {
  Rect,
  Path,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  /** Peptide mass in the vial (mg) — printed on the label band. */
  vialMg: number;
  /** Diluent volume added (mL) — sets the fill height. */
  diluentMl: number;
  /** Resulting concentration (mg/mL) — printed under the vial. */
  concentrationMgPerMl?: number;
  /** True for the acetic-acid compounds; changes the diluent name and tint. */
  isAcetic?: boolean;
  /**
   * Vial capacity in mL for the fill scale. Defaults to 3 mL, the common
   * lyophilised peptide vial. Pass the real figure where it is known.
   */
  capacityMl?: number;
  /** Layout width; height derives from the vial's aspect. */
  width?: number;
}

const ASPECT = 0.66; // width / height — a portrait vial

export function VialSVG({
  vialMg,
  diluentMl,
  concentrationMgPerMl,
  isAcetic = false,
  capacityMl = 3,
  width = 132,
}: Props) {
  const t = useV3Theme();
  const height = width / ASPECT;

  const ink = t.colors.textPrimary as string;
  // Acetic acid reads slightly warmer than water so the two are distinguishable
  // at a glance without relying on the caption alone.
  const liquid = isAcetic
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentLavender as string);
  const capColor = ink;

  // Vertical anatomy: cap | neck | shoulder | body | base.
  const bodyW = width * 0.62;
  const bodyX = (width - bodyW) / 2;
  const capW = bodyW * 0.52;
  const capX = (width - capW) / 2;
  const capH = height * 0.09;
  const neckH = height * 0.05;
  const shoulderH = height * 0.07;
  const bodyY = capH + neckH + shoulderH;
  const bodyH = height * 0.60;
  const bodyBottom = bodyY + bodyH;

  const ratio = capacityMl > 0 ? Math.max(0, Math.min(1, diluentMl / capacityMl)) : 0;
  const fillH = bodyH * ratio;
  const fillY = bodyBottom - fillH;

  const conc =
    concentrationMgPerMl ??
    (diluentMl > 0 ? vialMg / diluentMl : 0);

  const fmt = (n: number) => Number(n.toFixed(2)).toString();

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="vialGlass" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={ink} stopOpacity={0.13} />
            <Stop offset="0.25" stopColor={ink} stopOpacity={0.02} />
            <Stop offset="0.75" stopColor={ink} stopOpacity={0.04} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.14} />
          </LinearGradient>
          <LinearGradient id="vialLiquid" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={liquid} stopOpacity={0.85} />
            <Stop offset="0.35" stopColor={liquid} stopOpacity={0.55} />
            <Stop offset="1" stopColor={liquid} stopOpacity={0.8} />
          </LinearGradient>
          <LinearGradient id="crimp" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={capColor} stopOpacity={0.45} />
            <Stop offset="0.4" stopColor={capColor} stopOpacity={0.8} />
            <Stop offset="1" stopColor={capColor} stopOpacity={0.45} />
          </LinearGradient>
        </Defs>

        {/* Crimp cap + the rubber stopper showing beneath it */}
        <Rect x={capX} y={0} width={capW} height={capH} rx={2} fill="url(#crimp)" />
        <Rect
          x={capX + capW * 0.16}
          y={capH}
          width={capW * 0.68}
          height={neckH}
          fill={ink}
          opacity={0.35}
        />

        {/* Shoulder — the taper from neck out to the body */}
        <Path
          d={`M ${bodyX + bodyW * 0.22} ${capH + neckH}
              L ${bodyX + bodyW * 0.78} ${capH + neckH}
              L ${bodyX + bodyW} ${bodyY}
              L ${bodyX} ${bodyY} Z`}
          fill="url(#vialGlass)"
          stroke={ink}
          strokeOpacity={0.45}
          strokeWidth={1.1}
        />

        {/* Body */}
        <Rect
          x={bodyX}
          y={bodyY}
          width={bodyW}
          height={bodyH}
          rx={width * 0.045}
          fill="url(#vialGlass)"
          stroke={ink}
          strokeOpacity={0.5}
          strokeWidth={1.3}
        />

        {/* Liquid, inset so it sits inside the glass rather than on the stroke */}
        {fillH > 0.5 ? (
          <Rect
            x={bodyX + 1.3}
            y={fillY}
            width={bodyW - 2.6}
            height={Math.max(0, fillH - 1.3)}
            rx={width * 0.03}
            fill="url(#vialLiquid)"
          />
        ) : null}

        {/* Fill line + volume, drawn across the liquid's surface */}
        {fillH > 0.5 ? (
          <G>
            <Line
              x1={bodyX - width * 0.06}
              y1={fillY}
              x2={bodyX + bodyW + width * 0.06}
              y2={fillY}
              stroke={ink}
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            <SvgText
              x={width / 2}
              y={fillY - height * 0.014}
              fontSize={height * 0.055}
              fill={ink}
              opacity={0.75}
              textAnchor="middle"
            >
              {`${fmt(diluentMl)} mL`}
            </SvgText>
          </G>
        ) : null}

        {/* Label band — where the strength is printed on a real vial */}
        <Rect
          x={bodyX}
          y={bodyY + bodyH * 0.30}
          width={bodyW}
          height={bodyH * 0.26}
          fill={t.isDark ? '#000' : '#FFF'}
          opacity={t.isDark ? 0.30 : 0.62}
        />
        <SvgText
          x={width / 2}
          y={bodyY + bodyH * 0.30 + bodyH * 0.175}
          fontSize={height * 0.062}
          fontWeight="700"
          fill={ink}
          textAnchor="middle"
        >
          {`${fmt(vialMg)} mg`}
        </SvgText>

        {/* Base */}
        <Line
          x1={bodyX}
          y1={bodyBottom}
          x2={bodyX + bodyW}
          y2={bodyBottom}
          stroke={ink}
          strokeOpacity={0.5}
          strokeWidth={1.3}
        />

        {/* Result. The whole point of the picture: what you end up holding. */}
        <SvgText
          x={width / 2}
          y={height * 0.955}
          fontSize={height * 0.058}
          fontWeight="700"
          fill={ink}
          opacity={0.9}
          textAnchor="middle"
        >
          {`${fmt(conc)} mg/mL`}
        </SvgText>
      </Svg>
    </View>
  );
}
