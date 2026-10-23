import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("each app has its own output selector and real icon request", async ({ page }) => {
 await openMock(page,"view=panel&kind=volume");
 await expect(page.locator('.sound-app-icon img')).toHaveCount(2);
 await expectCall(page,'get_icon',{key:'/Applications/Spotify.app'});
 await page.getByRole('combobox',{name:'Spotify output',exact:true}).selectOption('headphones');
 await expectCall(page,'set_app_output',{id:'1',output:'headphones'});
 await expect(page.getByRole('combobox',{name:'Spotify output',exact:true})).toHaveValue('headphones');
 await expect(page.getByRole('combobox',{name:'Firefox output',exact:true})).toHaveValue('speakers');
});
test("failed per-app route keeps the previous selection and reports the failure", async ({ page }) => {
 await openMock(page,'view=panel&kind=volume',{}, {set_app_output:'output disconnected'});
 await page.getByRole('combobox',{name:'Spotify output',exact:true}).selectOption('headphones');
 await expect(page.getByRole('alert')).toContainText('Could not switch');
 await expect(page.getByRole('combobox',{name:'Spotify output',exact:true})).toHaveValue('speakers');
});
