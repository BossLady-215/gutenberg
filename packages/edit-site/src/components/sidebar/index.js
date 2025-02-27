/**
 * WordPress dependencies
 */
import { createSlotFill, PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { cog } from '@wordpress/icons';
import { useEffect } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { store as interfaceStore } from '@wordpress/interface';
import { store as blockEditorStore } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import DefaultSidebar from './default-sidebar';
import GlobalStylesSidebar from './global-styles-sidebar';
import NavigationMenuSidebar from './navigation-menu-sidebar';
import { STORE_NAME } from '../../store/constants';
import SettingsHeader from './settings-header';
import TemplateCard from './template-card';
import { SIDEBAR_BLOCK, SIDEBAR_TEMPLATE } from './constants';

const { Slot: InspectorSlot, Fill: InspectorFill } = createSlotFill(
	'EditSiteSidebarInspector'
);
export const SidebarInspectorFill = InspectorFill;

export function SidebarComplementaryAreaFills() {
	const { sidebar, isEditorSidebarOpened, hasBlockSelection } = useSelect(
		( select ) => {
			const _sidebar = select(
				interfaceStore
			).getActiveComplementaryArea( STORE_NAME );
			const _isEditorSidebarOpened = [
				SIDEBAR_BLOCK,
				SIDEBAR_TEMPLATE,
			].includes( _sidebar );
			return {
				sidebar: _sidebar,
				isEditorSidebarOpened: _isEditorSidebarOpened,
				hasBlockSelection: !! select(
					blockEditorStore
				).getBlockSelectionStart(),
			};
		},
		[]
	);
	const { enableComplementaryArea } = useDispatch( interfaceStore );
	useEffect( () => {
		if ( ! isEditorSidebarOpened ) return;
		if ( hasBlockSelection ) {
			enableComplementaryArea( STORE_NAME, SIDEBAR_BLOCK );
		} else {
			enableComplementaryArea( STORE_NAME, SIDEBAR_TEMPLATE );
		}
	}, [ hasBlockSelection, isEditorSidebarOpened ] );
	let sidebarName = sidebar;
	if ( ! isEditorSidebarOpened ) {
		sidebarName = hasBlockSelection ? SIDEBAR_BLOCK : SIDEBAR_TEMPLATE;
	}

	// Conditionally include NavMenu sidebar in Plugin only.
	// Optimise for dead code elimination.
	// See https://github.com/WordPress/gutenberg/blob/trunk/docs/how-to-guides/feature-flags.md#dead-code-elimination.
	let MaybeNavigationMenuSidebar = 'Fragment';

	if ( process.env.IS_GUTENBERG_PLUGIN ) {
		MaybeNavigationMenuSidebar = NavigationMenuSidebar;
	}

	return (
		<>
			<DefaultSidebar
				identifier={ sidebarName }
				title={ __( 'Settings' ) }
				icon={ cog }
				closeLabel={ __( 'Close settings sidebar' ) }
				header={ <SettingsHeader sidebarName={ sidebarName } /> }
				headerClassName="edit-site-sidebar__panel-tabs"
			>
				{ sidebarName === SIDEBAR_TEMPLATE && (
					<PanelBody>
						<TemplateCard />
					</PanelBody>
				) }
				{ sidebarName === SIDEBAR_BLOCK && (
					<InspectorSlot bubblesVirtually />
				) }
			</DefaultSidebar>
			<GlobalStylesSidebar />
			<MaybeNavigationMenuSidebar />
		</>
	);
}
