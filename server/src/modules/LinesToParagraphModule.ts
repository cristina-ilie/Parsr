/**
 * Copyright 2019 AXA
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	BoundingBox,
	Document,
	Element,
	Heading,
	Line,
	Page,
	Paragraph,
} from '../types/DocumentRepresentation';
import * as utils from '../utils';
import logger from '../utils/Logger';
import { Module } from './Module';
import { ReadingOrderDetectionModule } from './ReadingOrderDetectionModule';
import { WordsToLineModule } from './WordsToLineModule';

interface Options {
	addNewline?: boolean;
	alignUncertainty?: number; // value in px
	checkFont?: boolean;
	lineLengthUncertainty?: number; // factor of line width
	maxInterline?: number; // factor of line height
}

const defaultOptions = {
	addNewline: true,
	alignUncertainty: 3,
	checkFont: false,
	maxInterline: 0.3,
	lineLengthUncertainty: 0.25,
};

/**
 * Stability: Stable
 * Merge lines into paragraphs
 */
export class LinesToParagraphModule extends Module<Options> {
	public static moduleName = 'lines-to-paragraph';
	public static dependencies = [ReadingOrderDetectionModule, WordsToLineModule];

	constructor(options: Options = {}) {
		super(options, defaultOptions);
	}

	public main(doc: Document): Document {
		doc.pages.forEach((page: Page) => {
			if (page.getElementsOfType<Paragraph>(Paragraph).length > 0) {
				logger.warn(
					'Warning: this page already has some paragraphs in it. Not performing paragraph merge.',
				);
				return page;
			}

			const lines: Line[] = page.getElementsOfType<Line>(Line).sort(utils.sortElementsByOrder);
			const toBeMerged: Line[][] = [];
			const otherElements: Element[] = page.elements.filter(
				element => !(element instanceof Line) || !lines.includes(element),
			);

			for (let i = 0; i < lines.length; i++) {
				const firstLine: Line = lines[i];
				const mergeGroup: Line[] = [firstLine];

				for (let j = i + 1; j < lines.length; j++) {
					const prev: Line = lines[j - 1];
					const curr: Line = lines[j];

					if (
						//// FIXME (!this.options.checkFont || line1.font === line2.font) &&
						this.isAdjacentLine(prev, curr) &&
						(utils.isAligned([prev, curr], this.options.alignUncertainty) ||
							utils.isAlignedCenter([prev, curr], this.options.alignUncertainty)) &&
						// isntBulletList(prev, curr) &&
						// TODO handle table elements: !line1.properties.isTableElement &&
						// TODO handle table elements: !line2.properties.isTableElement &&
						prev instanceof Heading === curr instanceof Heading
					) {
						mergeGroup.push(curr);
						i++;
					} else {
						// i = j;
						break;
					}
				}

				toBeMerged.push(mergeGroup);
			}

			let newOrder = 0;
			const paragraphs: Paragraph[] = toBeMerged.map((group: Line[]) => {
				const paragraph: Paragraph = utils.mergeElements<Line, Paragraph>(
					new Paragraph(new BoundingBox(0, 0, 0, 0)),
					...group,
				);
				paragraph.properties.order = newOrder++;
				return paragraph;
			});

			page.elements = otherElements.concat(paragraphs);

			return page;
		});

		return doc;
	}

	/**
	 * Checks if two lines are adjacent or not by using a measure of their overlap uncertainty.
	 * @param line1 the first line
	 * @param line2 the second line
	 */
	private isAdjacentLine(line1: Line, line2: Line): boolean {
		const verticalOverlapUncertainty = (line1.height * 2) / 3;
		return (
			line1.top + line1.height < line2.top + verticalOverlapUncertainty &&
			line1.top + line1.height * (1 + this.options.maxInterline) > line2.top
		);
	}
}